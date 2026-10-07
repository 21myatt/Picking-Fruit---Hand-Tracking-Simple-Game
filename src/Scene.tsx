import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { ScreenSpaceUI, ScreenText, XRModel } from "@vincentt-xr/sdk";
import { HandTracker } from "@vincentt-xr/sdk/tracking";
import {
  useXRModelNode,
  type XRModelNodeHandTracking,
} from "@vincentt-xr/sdk/low-level";
import { BASKET, FruitGame, type Hand } from "./fruitGame";

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];
const UP = new Vector3(0, 1, 0);
const COLORS = ["#ff5678", "#ffb52e", "#b9ef61"];
const Fruit = ({ kind }: { kind: number }) => (
  <group>
    <mesh
      name={`fruit-body-${kind}`}
      scale={kind === 2 ? [0.85, 1.15, 0.85] : [1, 0.93, 1]}
    >
      <sphereGeometry args={[1, 24, 16]} />
      <meshStandardMaterial
        color={COLORS[kind]}
        roughness={0.35}
        emissive={COLORS[kind]}
        emissiveIntensity={0.25}
      />
    </mesh>
    {kind === 2 && (
      <mesh name="pear-neck" position={[0, 0.75, 0]} scale={[0.55, 0.75, 0.55]}>
        <sphereGeometry args={[1, 20, 12]} />
        <meshStandardMaterial color={COLORS[kind]} />
      </mesh>
    )}
    <mesh name="fruit-stem" position={[0, 1.05, 0]} rotation={[0, 0, -0.2]}>
      <cylinderGeometry args={[0.06, 0.08, 0.4, 8]} />
      <meshStandardMaterial color="#775139" />
    </mesh>
    <mesh
      name="fruit-leaf"
      position={[0.3, 1.16, 0]}
      rotation={[0, 0, -0.55]}
      scale={[0.45, 0.16, 0.1]}
    >
      <sphereGeometry args={[1, 12, 8]} />
      <meshStandardMaterial color="#47bb71" />
    </mesh>
  </group>
);

const Interaction = () => {
  const node = useXRModelNode<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
  const { viewport, camera, size } = useThree();
  const game = useMemo(() => new FruitGame(), []);
  const fruit = useRef<Group>(null);
  const basket = useRef<Group>(null);
  const variants = useRef<Group>(null);
  const halo = useRef<Group>(null);
  const particles = useRef<Group>(null);
  const skeletons = useRef<Group>(null);
  const boneDirection = useMemo(() => new Vector3(), []);
  const seenBurst = useRef(0);
  const burstStart = useRef(-100);
  const burstPoint = useRef({ x: 0, y: 0 });
  const directions = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        x: Math.cos(i * 2.4),
        y: Math.sin(i * 2.4),
        speed: 0.4 + (i % 5) * 0.1,
      })),
    [],
  );
  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    const dimensions = viewport.getCurrentViewport(camera, new Vector3());
    const aspect = size.width / size.height;
    let rawHands = node?.hands ?? [];
    if (!rawHands.length && node?.coordinates)
      rawHands = [
        { coordinates: node.coordinates, handedness: node.handedness },
      ];
    skeletons.current?.children.forEach((child, handIndex) => {
      const skeleton = child as Group;
      const points = rawHands[handIndex]?.coordinates;
      skeleton.visible = Boolean(
        points?.length === 21 &&
          points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      );
      if (!skeleton.visible || !points) return;
      const radius = dimensions.height * 0.004;
      skeleton.children.slice(0, 21).forEach((joint, index) => {
        joint.position.set(
          (points[index].x * dimensions.width) / 2,
          (points[index].y * dimensions.height) / 2,
          0,
        );
        joint.scale.setScalar(radius * 1.7);
      });
      HAND_CONNECTIONS.forEach(([from, to], index) => {
        const bone = skeleton.children[21 + index];
        const a = skeleton.children[from].position;
        const b = skeleton.children[to].position;
        bone.position.copy(a).add(b).multiplyScalar(0.5);
        boneDirection.copy(b).sub(a);
        bone.scale.set(radius, boneDirection.length(), radius);
        bone.quaternion.setFromUnitVectors(UP, boneDirection.normalize());
      });
    });
    const hands: Hand[] = rawHands.flatMap((hand, index) => {
      const points = hand.coordinates;
      if (!points || points.length < 21) return [];
      const thumb = points[4];
      const tip = points[8];
      const wrist = points[0];
      const middle = points[9];
      if (
        ![thumb, tip, wrist, middle].every(
          (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
        )
      )
        return [];
      const span = Math.hypot(
        (wrist.x - middle.x) * aspect,
        wrist.y - middle.y,
      );
      if (span < 0.02) return [];
      return [
        {
          id: hand.handedness ?? `hand-${index}`,
          point: { x: (thumb.x + tip.x) / 2, y: (thumb.y + tip.y) / 2 },
          pinch: Math.hypot((thumb.x - tip.x) * aspect, thumb.y - tip.y) / span,
        },
      ];
    });
    game.update(time, delta, hands, aspect);
    const unit = dimensions.height * 0.065;
    if (fruit.current) {
      fruit.current.visible = game.phase !== "respawning";
      fruit.current.position.set(
        (game.point.x * dimensions.width) / 2,
        (game.point.y * dimensions.height) / 2,
        0.12,
      );
      fruit.current.scale.setScalar(unit * (game.phase === "held" ? 1.15 : 1));
      fruit.current.rotation.set(0.1, time * 0.65, Math.sin(time) * 0.1);
    }
    variants.current?.children.forEach((child, index) => {
      const variant = child;
      variant.visible = index === game.fruit;
    });
    if (halo.current) {
      halo.current.children.forEach((child, index) => {
        const material = (child as Mesh).material as MeshBasicMaterial;
        material.color.set(COLORS[game.fruit]);
        material.opacity =
          (game.phase === "held" ? 0.12 : 0.045) * (1 - index / 6);
      });
      halo.current.rotation.copy(camera.rotation);
    }
    if (basket.current) {
      basket.current.position.set(0, (BASKET.y * dimensions.height) / 2, 0);
      basket.current.scale.set(
        (dimensions.width * BASKET.halfWidth) / 2,
        unit,
        unit,
      );
    }
    if (game.burst.serial !== seenBurst.current) {
      seenBurst.current = game.burst.serial;
      burstStart.current = time;
      burstPoint.current = { ...game.burst.point };
    }
    const age = time - burstStart.current;
    particles.current?.children.forEach((child, index) => {
      const particle = child as Mesh;
      particle.visible = age < 0.55;
      const direction = directions[index];
      particle.position.set(
        (burstPoint.current.x * dimensions.width) / 2 +
          direction.x * age * direction.speed,
        (burstPoint.current.y * dimensions.height) / 2 +
          direction.y * age * direction.speed,
        0.3,
      );
      particle.scale.setScalar(unit * 0.12 * Math.max(0, 1 - age / 0.55));
    });
  });
  return (
    <>
      <group ref={skeletons} name="hand-skeletons">
        {["#4de9ff", "#b6ff79"].map((color, handIndex) => (
          <group
            key={color}
            name={`hand-skeleton-${handIndex}`}
            visible={false}
          >
            {Array.from({ length: 21 }, (_, index) => (
              <mesh
                key={`joint-${index}`}
                name={`hand-${handIndex}-joint-${index}`}
                renderOrder={1100}
              >
                <sphereGeometry args={[1, 8, 6]} />
                <meshBasicMaterial
                  color="#ffffff"
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
            ))}
            {HAND_CONNECTIONS.map(([from, to]) => (
              <mesh
                key={`${from}-${to}`}
                name={`hand-${handIndex}-bone-${from}-${to}`}
                renderOrder={1099}
              >
                <cylinderGeometry args={[1, 1, 1, 6]} />
                <meshBasicMaterial
                  color={color}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      <group ref={fruit} name="floating-fruit">
        <group ref={variants}>
          {COLORS.map((color, kind) => (
            <group key={color}>
              <Fruit kind={kind} />
            </group>
          ))}
        </group>
        <group ref={halo} name="fruit-glow" position={[0, 0, -0.2]}>
          {[1.1, 1.25, 1.4, 1.55, 1.7].map((radius) => (
            <mesh name={`glow-layer-${radius}`} key={radius}>
              <circleGeometry args={[radius, 40]} />
              <meshBasicMaterial
                transparent
                opacity={0.05}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      </group>
      <group ref={basket} name="target-basket">
        <mesh name="basket-body" position={[0, -0.7, 0]}>
          <cylinderGeometry args={[1, 0.72, 1.3, 20, 1, true]} />
          <meshStandardMaterial color="#c68a4e" side={2} roughness={0.8} />
        </mesh>
        <mesh name="basket-rim" rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1, 0.08, 8, 32]} />
          <meshStandardMaterial
            color="#ffe1a2"
            emissive="#ffbb55"
            emissiveIntensity={0.45}
          />
        </mesh>
        {[-0.65, -0.3, 0.05, 0.4, 0.75].map((x) => (
          <mesh name={`basket-weave-${x}`} key={x} position={[x, -0.7, 0.7]}>
            <boxGeometry args={[0.035, 1.1, 0.08]} />
            <meshStandardMaterial color="#ffe1a2" />
          </mesh>
        ))}
      </group>
      <group ref={particles} name="sparkle-pool">
        {directions.map((direction, i) => (
          <mesh name={`sparkle-${i}`} key={direction.x}>
            <octahedronGeometry args={[1]} />
            <meshBasicMaterial color="#fff4b5" />
          </mesh>
        ))}
      </group>
      <ScreenSpaceUI>
        <ScreenText
          name="catch-prompt"
          text="Pinch a fruit. Flick up to toss."
          fontSize={32}
          color="#ffffff"
          strokeColor="#152032"
          strokeWidth={4}
          screenTransform={{
            enabled: true,
            position: { x: 0, y: -580 },
            size: { width: 650, height: 85 },
            pivot: [0.5, 0.5],
            rotation: 0,
            scale2D: { x: 1, y: 1 },
            referencePixelsPerUnit: 32,
            renderOrder: 1000,
            overlay: true,
            visible: true,
            showTransformGuides: false,
          }}
        />
      </ScreenSpaceUI>
    </>
  );
};
export const Scene = () => (
  <>
    <HandTracker />
    <Interaction />
  </>
);
