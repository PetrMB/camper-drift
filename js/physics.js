// Tenký wrapper nad Rapierem — init, svět, továrny na tělesa, kolizní eventy
import RAPIER from '@dimforge/rapier3d-compat';

export let R = null;
export let world = null;

let eventQueue = null;
const handleTag = new Map(); // colliderHandle -> {type, ref}

export async function initPhysics() {
    await RAPIER.init();
    R = RAPIER;
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    eventQueue = new RAPIER.EventQueue(true);

    // země, aby propy měly na co padat
    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.05, 5000).setFriction(0.9), groundBody);
    return RAPIER.version ? RAPIER.version() : 'ok';
}

export function tag(collider, type, ref) {
    handleTag.set(collider.handle, { type, ref });
}
export function tagOf(handle) {
    return handleTag.get(handle);
}
export function untag(collider) {
    handleTag.delete(collider.handle);
}

export function createVanBody(x, y, z) {
    const bd = R.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setCcdEnabled(true)
        .setCanSleep(false)
        .setAngularDamping(2.0);
    const body = world.createRigidBody(bd);
    // jen yaw rotace; y drží controller ručně (robustní napříč verzemi API)
    if (body.setEnabledRotations) body.setEnabledRotations(false, true, false, true);
    if (body.setEnabledTranslations) body.setEnabledTranslations(true, false, true, true);
    const cd = R.ColliderDesc.cuboid(1.0, 0.8, 2.3)
        .setFriction(0.4).setRestitution(0.1)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    const col = world.createCollider(cd, body);
    tag(col, 'van', null);
    return { body, col };
}

export function createRock(x, z, r, ref) {
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, r * 0.7, z));
    const col = world.createCollider(R.ColliderDesc.ball(r).setFriction(0.8), body);
    tag(col, 'rock', ref);
    return { body, col };
}

export function createProp(kind, ref) {
    // barikáda apod. — lehká dynamická tělesa, létají při nárazu
    const bd = R.RigidBodyDesc.dynamic()
        .setTranslation(0, -50, 0) // parkoviště poolu
        .setLinearDamping(0.4).setAngularDamping(0.8)
        .setCanSleep(true);
    const body = world.createRigidBody(bd);
    let cd;
    if (kind === 'barrier') {
        cd = R.ColliderDesc.cuboid(0.78, 0.25, 0.12).setDensity(0.35);
    } else if (kind === 'cone') {
        cd = R.ColliderDesc.cylinder(0.36, 0.22).setDensity(0.25);
    } else {
        cd = R.ColliderDesc.cuboid(0.55, 0.42, 0.55).setDensity(0.6);
    }
    cd.setFriction(0.7).setRestitution(0.25).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    const col = world.createCollider(cd, body);
    tag(col, 'prop', ref);
    body.sleep();
    return { body, col };
}

export function createPolice(x, z, ref) {
    // policejní auto — statická tvrdá překážka (náraz = konec)
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, 0.9, z));
    const col = world.createCollider(R.ColliderDesc.cuboid(1.0, 0.9, 2.3).setFriction(0.6), body);
    tag(col, 'police', ref);
    return { body, col };
}

export function removeBody(entry) {
    if (!entry) return;
    untag(entry.col);
    world.removeRigidBody(entry.body);
}

export function parkProp(entry, i) {
    entry.body.setTranslation({ x: (i % 16) * 4 - 2000, y: -50, z: Math.floor(i / 16) * 4 }, false);
    entry.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    entry.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    entry.body.sleep();
}

export function placeProp(entry, x, y, z, yaw) {
    entry.body.setTranslation({ x, y, z }, true);
    const q = quatFromYaw(yaw);
    entry.body.setRotation(q, true);
    entry.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    entry.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
}

export function quatFromYaw(a) {
    return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}

// krok světa + kolizní callbacky: cb(typeA, refA, typeB, refB)
export function stepPhysics(dt, onContact) {
    world.timestep = dt;
    world.step(eventQueue);
    eventQueue.drainCollisionEvents((h1, h2, started) => {
        if (!started || !onContact) return;
        const a = handleTag.get(h1), b = handleTag.get(h2);
        if (a && b) onContact(a, b);
    });
}
