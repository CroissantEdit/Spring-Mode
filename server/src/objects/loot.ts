import { GameConstants, ObjectCategory, PlayerActions } from "../../../common/src/constants";
import { ArmorType } from "../../../common/src/definitions/armors";
import { Loots, type LootDefinition } from "../../../common/src/definitions/loots";
import { PickupPacket } from "../../../common/src/packets/pickupPacket";
import { CircleHitbox } from "../../../common/src/utils/hitbox";
import { Geometry, Numeric, Collision } from "../../../common/src/utils/math";
import { ItemType, LootRadius, type ReifiableDef } from "../../../common/src/utils/objectDefinitions";
import { type ObjectsNetData } from "../../../common/src/utils/objectsSerializations";
import { randomRotation } from "../../../common/src/utils/random";
import { Vec, type Vector } from "../../../common/src/utils/vector";
import { type Game } from "../game";
import { GunItem } from "../inventory/gunItem";
import { BaseGameObject } from "./gameObject";
import { Obstacle } from "./obstacle";
import { type Player } from "./player";

export class Loot extends BaseGameObject<ObjectCategory.Loot> {
    override readonly type = ObjectCategory.Loot;

    declare readonly hitbox: CircleHitbox;

    readonly definition: LootDefinition;

    count;
    isNew = true;
    velocity = Vec.create(0, 0);

    get position(): Vector { return this.hitbox.position; }
    set position(pos: Vector) { this.hitbox.position = pos; }

    private _oldPosition = Vec.create(0, 0);

    constructor(game: Game, definition: ReifiableDef<LootDefinition>, position: Vector, count?: number) {
        super(game, position);

        this.definition = Loots.reify(definition);

        this.hitbox = new CircleHitbox(LootRadius[this.definition.itemType], Vec.clone(position));

        this.count = count ?? 1;

        this.push(randomRotation(), 1);

        this.game.addTimeout(() => { this.isNew = false; }, 100);
    }

    update(): void {
        const moving = Math.abs(this.velocity.x) > 0.001 ||
            Math.abs(this.velocity.y) > 0.001 ||
            !Vec.equals(this._oldPosition, this.position);

        if (!moving) return;

        this._oldPosition = Vec.clone(this.position);

        if (this.game.map.terrain.groundRect.isPointInside(this.position)) {
            const rivers = this.game.map.terrain.getRiversInPosition(this.position);
            for (const river of rivers) {
                if (river.waterHitbox.isPointInside(this.position)) {
                    const t = river.getClosestT(this.position);

                    const tangent = river.getTangent(t);

                    this.push(Math.atan2(tangent.y, tangent.x), -1);
                    break;
                }
            }
        }

        this.velocity = Vec.scale(this.velocity, 0.9);
        const velocity = Vec.scale(this.velocity, 1 / GameConstants.tps);
        velocity.x = Numeric.clamp(velocity.x, -1, 1);
        velocity.y = Numeric.clamp(velocity.y, -1, 1);
        this.position = Vec.add(this.position, velocity);
        this.position.x = Numeric.clamp(this.position.x, this.hitbox.radius, this.game.map.width - this.hitbox.radius);
        this.position.y = Numeric.clamp(this.position.y, this.hitbox.radius, this.game.map.height - this.hitbox.radius);

        const objects = this.game.grid.intersectsHitbox(this.hitbox);
        for (const object of objects) {
            if (
                moving &&
                object instanceof Obstacle &&
                object.collidable &&
                object.hitbox.collidesWith(this.hitbox)
            ) {
                this.hitbox.resolveCollision(object.hitbox);
            }

            if (object instanceof Loot && object !== this && object.hitbox.collidesWith(this.hitbox)) {
                const collision = Collision.circleCircleIntersection(this.position, this.hitbox.radius, object.position, object.hitbox.radius);
                if (collision) {
                    this.velocity = Vec.sub(this.velocity, Vec.scale(collision.dir, 0.45));
                }

                const dist = Math.max(Geometry.distance(object.position, this.position), 1);
                const vecCollision = Vec.create(object.position.x - this.position.x, object.position.y - this.position.y);
                const vecCollisionNorm = Vec.create(vecCollision.x / dist, vecCollision.y / dist);
                const vRelativeVelocity = Vec.create(this.velocity.x - object.velocity.x, this.velocity.y - object.velocity.y);

                const speed = vRelativeVelocity.x * vecCollisionNorm.x + vRelativeVelocity.y * vecCollisionNorm.y;

                if (speed < 0) continue;

                this.velocity.x -= (speed * vecCollisionNorm.x);
                this.velocity.y -= (speed * vecCollisionNorm.y);
                object.velocity.x += (speed * vecCollisionNorm.x);
                object.velocity.y += (speed * vecCollisionNorm.y);
            }
        }

        if (!Vec.equals(this._oldPosition, this.position)) {
            this.game.partialDirtyObjects.add(this);
            this.game.grid.updateObject(this);
        }
    }

    push(angle: number, velocity: number): void {
        this.velocity = Vec.add(this.velocity, Vec.fromPolar(angle, velocity));
    }

    canInteract(player: Player): boolean {
        if (this.dead) return false;
        const inventory = player.inventory;

        switch (this.definition.itemType) {
            case ItemType.Gun: {
                for (const weapon of inventory.weapons) {
                    if (
                        weapon instanceof GunItem &&
                        !weapon.definition.isDual &&
                        weapon.definition.dualVariant &&
                        weapon.definition === this.definition
                    ) {
                        return true;
                    }
                }

                return !inventory.hasWeapon(0) ||
                    !inventory.hasWeapon(1) ||
                    (inventory.activeWeaponIndex < 2 && this.definition !== inventory.activeWeapon.definition);
            }
            case ItemType.Healing:
            case ItemType.Ammo: {
                const idString = this.definition.idString;

                return inventory.items[idString] + 1 <= (inventory.backpack?.maxCapacity[idString] ?? 0);
            }
            case ItemType.Melee: {
                return this.definition !== inventory.getWeapon(2)?.definition;
            }
            case ItemType.Armor: {
                let threshold = -Infinity;
                switch (this.definition.armorType) {
                    case ArmorType.Helmet: {
                        threshold = inventory.helmet?.level ?? 0;
                        break;
                    }
                    case ArmorType.Vest: {
                        threshold = inventory.vest?.level ?? 0;
                        break;
                    }
                }

                return this.definition.level > threshold;
            }
            case ItemType.Backpack: {
                return this.definition.level > (inventory.backpack?.level ?? 0);
            }
            case ItemType.Scope: {
                return inventory.items[this.definition.idString] === 0;
            }
            case ItemType.Skin: {
                return true;
            }
        }
    }

    interact(player: Player, noPickup = false): void {
        if (this.dead) return;
        const createNewItem = (type: LootDefinition = this.definition): void => {
            this.game.addLoot(type, this.position, this.count).push(player.rotation + Math.PI, 6);
        };

        if (noPickup) {
            this.game.removeLoot(this);
            createNewItem();
            return;
        }

        const inventory = player.inventory;
        let deleteItem = true;

        switch (this.definition.itemType) {
            case ItemType.Melee: {
                inventory.addOrReplaceWeapon(2, this.definition);
                break;
            }
            case ItemType.Gun: {
                let gotDual = false;
                for (let i = 0, l = inventory.weapons.length; i < l; i++) {
                    const weapon = inventory.weapons[i];

                    if (
                        weapon instanceof GunItem &&
                        weapon.definition.dualVariant &&
                        weapon.definition === this.definition
                    ) {
                        player.dirty.weapons = true;
                        player.game.fullDirtyObjects.add(player);
                        const wasReloading = player.action?.type === PlayerActions.Reload;
                        if (wasReloading) player.action!.cancel();
                        player.inventory.upgradeToDual(i);
                        if (wasReloading) {
                            (player.activeItem as GunItem).reload(true);
                        }

                        gotDual = true;
                        break;
                    }
                }
                if (gotDual) break;

                if (!inventory.hasWeapon(0) || !inventory.hasWeapon(1)) {
                    const slot = inventory.appendWeapon(this.definition);
                    if (inventory.activeWeaponIndex > 1) {
                        inventory.setActiveWeaponIndex(slot);
                    }
                } else if (inventory.activeWeaponIndex < 2 && this.definition !== inventory.activeWeapon.definition) {
                    if (player.action?.type === PlayerActions.Reload) player.action.cancel();

                    inventory.addOrReplaceWeapon(inventory.activeWeaponIndex, this.definition);
                }
                break;
            }
            case ItemType.Healing:
            case ItemType.Ammo: {
                const idString = this.definition.idString;
                const currentCount = inventory.items[idString];
                const maxCapacity = inventory.backpack?.maxCapacity[idString] ?? 0;

                if (currentCount + 1 <= maxCapacity) {
                    if (currentCount + this.count <= maxCapacity) {
                        inventory.items[idString] += this.count;
                    } else /* if (currentCount + this.count > maxCapacity) */ {
                        inventory.items[idString] = maxCapacity;
                        this.count = currentCount + this.count - maxCapacity;
                        this.game.fullDirtyObjects.add(this);
                        deleteItem = false;
                    }
                }
                break;
            }
            case ItemType.Armor: {
                switch (this.definition.armorType) {
                    case ArmorType.Helmet:
                        if (player.inventory.helmet) createNewItem(player.inventory.helmet);
                        player.inventory.helmet = this.definition;
                        break;
                    case ArmorType.Vest:
                        if (player.inventory.vest) createNewItem(player.inventory.vest);
                        player.inventory.vest = this.definition;
                }

                this.game.fullDirtyObjects.add(player);
                break;
            }
            case ItemType.Backpack: {
                if ((player.inventory.backpack?.level ?? 0) > 0) createNewItem(player.inventory.backpack);
                player.inventory.backpack = this.definition;

                this.game.fullDirtyObjects.add(player);
                break;
            }
            case ItemType.Scope: {
                inventory.items[this.definition.idString] = 1;

                if (this.definition.zoomLevel > player.inventory.scope.zoomLevel) {
                    player.inventory.scope = this.definition.idString;
                }

                break;
            }
            case ItemType.Skin: {
                createNewItem(player.loadout.skin);
                player.loadout.skin = this.definition;

                this.game.fullDirtyObjects.add(player);
                break;
            }
        }

        player.dirty.items = true;

        // Destroy the old loot
        this.game.removeLoot(this);

        // Send pickup packet
        const packet = new PickupPacket();
        packet.item = this.definition;
        player.sendPacket(packet);

        // If the item wasn't deleted, create a new loot item pushed slightly away from the player
        if (!deleteItem) createNewItem();

        // Reload active gun if the player picks up the correct ammo
        const activeWeapon = player.inventory.activeWeapon;
        if (
            activeWeapon instanceof GunItem &&
            activeWeapon.ammo === 0 &&
            this.definition.idString === activeWeapon.definition.ammoType
        ) {
            activeWeapon.reload();
        }
    }

    override get data(): Required<ObjectsNetData[ObjectCategory.Loot]> {
        return {
            position: this.position,
            full: {
                definition: this.definition,
                count: this.count,
                isNew: this.isNew
            }
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    override damage(): void { }
}
