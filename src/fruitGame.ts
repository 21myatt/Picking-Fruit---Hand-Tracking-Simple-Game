export type Point = { x: number; y: number };
export type Hand = { id: string; point: Point; pinch: number };
export type Phase = "floating" | "held" | "flying" | "respawning";
export const BASKET = { x: 0, y: 0.65, halfWidth: 0.32 };
const distance = (a: Point, b: Point, aspect: number) =>
  Math.hypot((a.x - b.x) * aspect, a.y - b.y);
export class FruitGame {
  phase: Phase = "floating";

  point: Point = { x: 0, y: -0.15 };

  velocity: Point = { x: 0, y: 0 };

  fruit = 0;

  owner: string | null = null;

  lostAt: number | null = null;

  respawnAt = 0;

  samples: { time: number; point: Point }[] = [];

  armed = new Map<string, boolean>();

  burst: { point: Point; success: boolean; serial: number } = {
    point: this.point,
    success: false,
    serial: 0,
  };

  update(time: number, delta: number, hands: Hand[], aspect: number) {
    const dt = Math.min(delta, 0.05);
    hands.forEach((hand) => {
      if (hand.pinch > 0.45) this.armed.set(hand.id, true);
    });
    if (this.phase === "floating") {
      this.point = {
        x: Math.sin(time * 0.7) * 0.48,
        y: -0.16 + Math.sin(time * 1.1) * 0.18,
      };
      const grab = hands.find(
        (hand) =>
          this.armed.get(hand.id) &&
          hand.pinch < 0.28 &&
          distance(hand.point, this.point, aspect) < 0.16,
      );
      hands.forEach((hand) => {
        if (hand.pinch < 0.28) this.armed.set(hand.id, false);
      });
      if (grab) {
        this.phase = "held";
        this.owner = grab.id;
        this.point = { ...grab.point };
        this.samples = [{ time, point: { ...grab.point } }];
        this.emit(false);
      }
    } else if (this.phase === "held") {
      const hand = hands.find((item) => item.id === this.owner);
      if (!hand) {
        if (this.lostAt === null) this.lostAt = time;
        if (time - this.lostAt >= 0.3) {
          this.phase = "floating";
          if (this.owner) this.armed.set(this.owner, false);
          this.owner = null;
          this.samples = [];
          this.lostAt = null;
        }
        return;
      }
      if (this.lostAt !== null) this.samples = [];
      this.lostAt = null;
      this.samples.push({ time, point: { ...hand.point } });
      this.samples = this.samples.filter(
        (sample) => time - sample.time <= 0.12,
      );
      const smoothing = 1 - Math.exp(-28 * dt);
      this.point.x += (hand.point.x - this.point.x) * smoothing;
      this.point.y += (hand.point.y - this.point.y) * smoothing;
      if (hand.pinch > 0.45) {
        const first = this.samples[0];
        const elapsed = time - first.time;
        this.velocity =
          elapsed > 0.015
            ? {
                x: Math.max(
                  -3,
                  Math.min(3, (hand.point.x - first.point.x) / elapsed),
                ),
                y: Math.max(
                  -2,
                  Math.min(4, (hand.point.y - first.point.y) / elapsed),
                ),
              }
            : { x: 0, y: 0 };
        this.phase = "flying";
        this.owner = null;
      }
    } else if (this.phase === "flying") {
      const previous = { ...this.point };
      this.point.x += this.velocity.x * dt;
      this.point.y += this.velocity.y * dt - 0.7 * dt * dt;
      this.velocity.y -= 1.4 * dt;
      const crossed = previous.y < BASKET.y && this.point.y >= BASKET.y;
      const crossX = crossed
        ? previous.x +
          (this.point.x - previous.x) *
            ((BASKET.y - previous.y) / (this.point.y - previous.y))
        : Infinity;
      if (crossed && Math.abs(crossX - BASKET.x) < BASKET.halfWidth - 0.07) {
        this.point = { x: crossX, y: BASKET.y };
        this.emit(true);
        this.phase = "respawning";
        this.respawnAt = time + 0.45;
      } else if (
        Math.abs(this.point.x) > 1.2 ||
        this.point.y > 1.2 ||
        this.point.y < -1.2
      ) {
        this.phase = "respawning";
        this.respawnAt = time + 0.25;
      }
    } else if (time >= this.respawnAt) {
      this.fruit = (this.fruit + 1) % 3;
      this.phase = "floating";
      this.armed.clear();
    }
  }

  emit(success: boolean) {
    this.burst = {
      point: { ...this.point },
      success,
      serial: this.burst.serial + 1,
    };
  }
}
