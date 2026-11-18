import RAPIER from '@dimforge/rapier3d-compat';

const TIME_STEP = 1 / 60;
const HARBOR_LIMIT = 135;
const START = { x: 0, y: 0, z: 2 };
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const ZERO = { x: 0, y: 0, z: 0 };
const INITIAL_STATE = { x: START.x, z: START.z, heading: 0, speed: 0, turnRate: 0 };
let ready;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addObstruction(world, obstacle) {
  const { x, z, hx, hz, radius, angle = 0 } = obstacle;
  const shape = radius !== undefined
    ? RAPIER.ColliderDesc.cylinder(3, radius)
    : RAPIER.ColliderDesc.cuboid(hx, 3, hz);
  shape.setTranslation(x, 0, z);
  shape.setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
  world.createCollider(shape.setRestitution(0.06).setFriction(0.15));
}

// Positive helm and heading are clockwise on the chart. Rapier's Y rotation
// has the opposite sign because the boat's local bow points down the Z axis.
function getHeading(body) {
  const { y, w } = body.rotation();
  return Math.atan2(-2 * w * y, 1 - 2 * y * y);
}

export async function createNavigation(obstacles = []) {
  ready ??= RAPIER.init().catch(error => {
    ready = undefined;
    throw error;
  });
  await ready;

  const world = new RAPIER.World(ZERO);
  world.timestep = TIME_STEP;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(START.x, START.y, START.z)
      .enabledTranslations(true, false, true)
      .enabledRotations(false, true, false)
      .setCanSleep(false)
      .setCcdEnabled(true),
  );

  // The capsule is 5.2 m long and 2.1 m wide, with rounded ends that
  // slide along quay walls and posts during a glancing collision.
  const hull = RAPIER.ColliderDesc.capsule(1.55, 1.05)
    .setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
    .setMass(1200)
    .setFriction(0.15)
    .setRestitution(0.06);
  world.createCollider(hull, body);
  for (const obstacle of obstacles) addObstruction(world, obstacle);
  for (const side of [-1, 1]) {
    const edge = side * (HARBOR_LIMIT + 1);
    addObstruction(world, { x: edge, z: 0, hx: 1, hz: HARBOR_LIMIT + 2 });
    addObstruction(world, { x: 0, z: edge, hx: HARBOR_LIMIT + 2, hz: 1 });
  }

  let accumulator = 0;
  let state = { ...INITIAL_STATE };
  let disposed = false;

  function advance(throttle, steer, braking) {
    const heading = getHeading(body);
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const velocity = body.linvel();
    const forward = velocity.x * sin - velocity.z * cos;
    const lateral = velocity.x * cos + velocity.z * sin;

    const thrust = throttle >= 0
      ? throttle * 2.8 * clamp((8.85 - forward) / 1.4, 0, 1)
      : throttle * 1.8 * clamp((3.35 + forward) / 0.9, 0, 1);
    const waterDrag = forward * (0.078 + 0.006 * Math.abs(forward));
    const brakeDrag = braking * Math.sign(forward) * Math.min(2.8 + Math.abs(forward) * 0.4, Math.abs(forward) / TIME_STEP);
    const acceleration = thrust * (1 - braking) - waterDrag - brakeDrag;
    const sideAcceleration = -lateral * (1.35 + 0.11 * Math.abs(forward) + 1.4 * braking);
    const impulseScale = body.mass() * TIME_STEP;
    body.applyImpulse({
      x: (sin * acceleration + cos * sideAcceleration) * impulseScale,
      y: 0,
      z: (-cos * acceleration + sin * sideAcceleration) * impulseScale,
    }, true);

    // A rudder gains authority as water passes it, and reverses when backing.
    // Low-speed prop wash also permits steering when easing away from a pier.
    const flow = forward + throttle * (1 - braking) * 0.55;
    const targetTurnRate = 0.82 * steer * Math.tanh(flow / 2.9);
    const yaw = body.angvel().y;
    const yawResponse = 1 - Math.exp(-1.85 * TIME_STEP);
    body.setAngvel({ x: 0, y: yaw + (-targetTurnRate - yaw) * yawResponse, z: 0 }, true);
    world.step();
  }

  function readState() {
    const { x, z } = body.translation();
    const heading = getHeading(body);
    const velocity = body.linvel();
    const speed = velocity.x * Math.sin(heading) - velocity.z * Math.cos(heading);
    return { x, z, heading, speed, turnRate: -body.angvel().y };
  }

  return {
    get state() { return state; },
    step(dt, { throttle = 0, steer = 0, brake = false } = {}) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return state;
      const engine = clamp(throttle, -1, 1);
      const rudder = clamp(steer, -1, 1);
      const braking = clamp(Number(brake), 0, 1);
      accumulator += Math.min(dt, 0.2);
      while (accumulator >= TIME_STEP) {
        advance(engine, rudder, braking);
        accumulator -= TIME_STEP;
      }
      state = readState();
      return state;
    },
    reset() {
      if (disposed) return;
      body.setTranslation(START, true);
      body.setRotation(IDENTITY, true);
      body.setLinvel(ZERO, true);
      body.setAngvel(ZERO, true);
      accumulator = 0;
      state = { ...INITIAL_STATE };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      world.free();
    },
  };
}
