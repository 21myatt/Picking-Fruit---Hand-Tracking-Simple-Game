import { describe, expect, it } from "vitest";
import { FruitGame, BASKET } from "./fruitGame";
const hand = (x = 0, y = -0.16, pinch = 0.2, id = "left") => ({
  id,
  point: { x, y },
  pinch,
});
const grab = () => {
  const game = new FruitGame();
  game.update(0, 0.016, [hand(0, -0.16, 0.6)], 0.56);
  game.update(0.016, 0.016, [hand()], 0.56);
  return game;
};
describe("fruit interaction", () => {
  it("requires an open pinch and proximity, with a fresh closing edge", () => {
    const game = new FruitGame();
    game.update(0, 0.016, [hand()], 0.56);
    expect(game.phase).toBe("floating");
    game.update(0.01, 0.01, [hand(1, 0, 0.6)], 0.56);
    game.update(0.02, 0.01, [hand(1, 0)], 0.56);
    game.update(0.03, 0.01, [hand()], 0.56);
    expect(game.phase).toBe("floating");
    expect(grab().phase).toBe("held");
  });
  it("keeps pinch hysteresis and ownership", () => {
    const game = grab();
    game.update(
      0.03,
      0.014,
      [hand(0, 0, 0.35), hand(1, 1, 0.6, "right")],
      0.56,
    );
    expect(game.phase).toBe("held");
    expect(game.owner).toBe("left");
  });
  it("freezes during brief loss and resets without throwing after 300 ms", () => {
    const game = grab();
    const point = { ...game.point };
    game.update(0.05, 0.02, [], 0.56);
    game.update(0.25, 0.02, [hand(1, 1, 0.2, "right")], 0.56);
    expect(game.point).toEqual(point);
    expect(game.phase).toBe("held");
    game.update(0.36, 0.02, [], 0.56);
    expect(game.phase).toBe("floating");
  });
  it("uses recent movement for upward throw and drops stationary releases", () => {
    const game = grab();
    game.update(0.08, 0.04, [hand(0, 0)], 0.56);
    game.update(0.12, 0.04, [hand(0.05, 0.16, 0.6)], 0.56);
    expect(game.phase).toBe("flying");
    expect(game.velocity.y).toBeGreaterThan(2);
    const still = grab();
    still.update(0.08, 0.04, [hand(0, -0.16, 0.6)], 0.56);
    expect(still.velocity.y).toBe(0);
    still.update(0.1, 0.02, [], 0.56);
    expect(still.point.y).toBeLessThan(-0.16);
  });
  it("sweeps fast trajectories through the opening and respawns one next fruit", () => {
    const game = new FruitGame();
    game.phase = "flying";
    game.point = { x: 0, y: BASKET.y - 0.02 };
    game.velocity = { x: 0, y: 4 };
    game.update(1, 0.05, [], 0.56);
    expect(game.phase).toBe("respawning");
    expect(game.burst.success).toBe(true);
    game.update(1.5, 0.05, [], 0.56);
    expect(game.phase).toBe("floating");
    expect(game.fruit).toBe(1);
  });
  it("misses outside the opening and resolves offscreen without a success burst", () => {
    const game = new FruitGame();
    game.phase = "flying";
    game.point = { x: 0.8, y: 0.64 };
    game.velocity = { x: 0, y: 4 };
    game.update(1, 0.05, [], 0.56);
    expect(game.phase).toBe("flying");
    game.point.y = 1.21;
    game.update(1.1, 0.02, [], 0.56);
    expect(game.phase).toBe("respawning");
    expect(game.burst.serial).toBe(0);
  });
});
