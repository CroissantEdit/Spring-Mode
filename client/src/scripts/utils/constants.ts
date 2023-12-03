/* eslint-disable @typescript-eslint/indent */
import { Color } from "pixi.js";
import { type ColorKeys, MODE } from "../../../../common/src/definitions/modes";

export const UI_DEBUG_MODE = false;
export const HITBOX_DEBUG_MODE = true;

export const HITBOX_COLORS = {
    obstacle: new Color("red"),
    obstacleNoCollision: new Color("yellow"),
    spawnHitbox: new Color("orange"),
    buildingZoomCeiling: new Color("purple"),
    buildingScopeCeiling: new Color("cyan"),
    loot: new Color("magenta"),
    player: new Color("blue"),
    playerWeapon: new Color("lime")
};

export const COLORS = {
    grass: new Color("hsl(81, 60%, 42%)"),
    water: new Color("hsl(200, 55%, 43%)"),
    border: new Color("hsl(211, 63%, 30%)"),
    beach: new Color("hsl(36, 89%, 62%)"),
    riverBank: new Color("hsl(0, 0%, 54%)"),
    gas: new Color("hsl(17, 100%, 50%)").setAlpha(0.55)
};

export const BULLET_COLORS: Record<string, number> = {
    "9mm": 0xffff80,
    "12g": 0xffc8c8,
    "556mm": 0x80ff80,
    "762mm": 0x80ffff,
    shrapnel: 0x1d1d1d
};
export const GHILLIE_TINT = COLORS.grass.multiply(new Color("hsl(0, 0%, 99%)"));
export const PIXI_SCALE = 20;

export const FIRST_EMOTE_ANGLE = Math.atan2(-1, -1);
export const SECOND_EMOTE_ANGLE = Math.atan2(1, 1);
export const THIRD_EMOTE_ANGLE = Math.atan2(-1, 1);
export const FOURTH_EMOTE_ANGLE = Math.atan2(1, -1);
