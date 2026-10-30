// Handbyggd, stiliserad testmodell av tomten utifrån referensbilder.
// Meter. x = öst, z = syd (verandan/framsidan), y = upp. Anpassa måtten nedan efter det riktiga huset.
export function buildTestLot(THREE) {
  const g = new THREE.Group();
  const mats = {};
  const M = (c, o = {}) => (mats[c + JSON.stringify(o)] ??= new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide, ...o }));
  const box = (w, h, d, x, y, z, color, parent = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color));
    m.position.set(x, y, z); parent.add(m); return m;
  };
  const cyl = (r, h, x, y, z, color, seg = 16) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), M(color));
    m.position.set(x, y, z); g.add(m); return m;
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const STUCCO = 0xdfd3bd, CONCRETE = 0x9a9a92, ROOF = 0x2a2a2e, WHITE = 0xf2eee6, GLASS = 0x2c3e50;
  const BASE = 2.2, H = BASE + 5.4; // sockelhöjd, takfotshöjd

  // ---- Mark ----
  box(38, 0.3, 36, 2, -0.15, 2, 0x5f9a3a);                 // gräsmatta
  box(30, 0.04, 9, 0, 0.02, 15.5, 0x8d8d89);               // grusplan framför
  box(5, 0.04, 14, -17, 0.02, 4, 0x8d8d89);                // uppfart västerut

  // ---- Husets volymer ----
  const mainL = 20, mainW = 8.4, wingW = 8, wingD = 5;
  box(mainL, BASE, mainW, 0, BASE / 2, 0, CONCRETE);
  box(mainL, 5.4, mainW, 0, BASE + 2.7, 0, STUCCO);
  // Tvärflygel mot söder (vänster)
  box(wingW, BASE, wingD, -6, BASE / 2, 4.2 + wingD / 2, CONCRETE);
  box(wingW, 5.4, wingD, -6, BASE + 2.7, 4.2 + wingD / 2, STUCCO);

  // Brutet tak: ridge längs lokala x, tvärsnitt i (z, y)
  function gambrel(L, hw, caps, rotY, cx, cz) {
    const grp = new THREE.Group(); grp.position.set(cx, H, cz); grp.rotation.y = rotY; g.add(grp);
    const bx = hw - 1.1, by = 2.5, ry = 4.1, ov = 0.45;
    const prof = [[hw + 0.35, -0.05], [bx + 0.2, by], [0, ry + 0.1], [-bx - 0.2, by], [-hw - 0.35, -0.05]];
    const quad = (a, b, c, d) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
      geo.computeVertexNormals();
      grp.add(new THREE.Mesh(geo, M(ROOF)));
    };
    const x0 = -L / 2 - ov, x1 = L / 2 + ov;
    for (let i = 0; i < prof.length - 1; i++) {
      const [z0, y0] = prof[i], [z1, y1] = prof[i + 1];
      quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1]);
    }
    const shape = new THREE.Shape([[-hw, 0], [hw, 0], [bx, by], [0, ry], [-bx, by]].map(([u, v]) => new THREE.Vector2(u, v)));
    caps.forEach(sign => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
      geo.rotateY(Math.PI / 2);                 // extrusion längs lokala x
      const wall = new THREE.Mesh(geo, M(STUCCO)); wall.position.x = sign * L / 2 - (sign > 0 ? 0.3 : 0); grp.add(wall);
      const trimShape = new THREE.Shape([[-hw - 0.35, -0.05], [hw + 0.35, -0.05], [bx + 0.25, by + 0.02], [0, ry + 0.15], [-bx - 0.25, by + 0.02]].map(([u, v]) => new THREE.Vector2(u, v)));
      const tg = new THREE.ExtrudeGeometry(trimShape, { depth: 0.1, bevelEnabled: false }); tg.rotateY(Math.PI / 2);
      const trim = new THREE.Mesh(tg, M(WHITE)); trim.position.x = sign * (L / 2 + ov) - (sign > 0 ? 0.1 : 0); grp.add(trim);
    });
    return grp;
  }
  gambrel(mainL, mainW / 2, [-1, 1], 0, 0, 0);
  gambrel(9.4, wingW / 2, [1], Math.PI / 2, -6, 4.6);

  // Skorstenar
  box(1.1, 2.4, 1.1, -3.5, H + 4.1 + 0.9, 0, 0x3b3b42);
  box(1.1, 2.4, 1.1, 4.5, H + 4.1 + 0.9, 0, 0x3b3b42);

  // Takkupa mot söder
  const dorm = new THREE.Group(); dorm.position.set(4.6, H + 1.3, 3.2); g.add(dorm);
  box(4.2, 1.7, 1.9, 0, 0, 0, WHITE, dorm);
  box(4.6, 0.2, 2.3, 0, 1.0, 0.1, ROOF, dorm);
  box(3.4, 0.8, 0.12, 0, 0.1, 0.98, GLASS, dorm);

  // ---- Fönster ----
  function win(x, y, z, face, w = 1.0, h = 1.5) {
    const grp = new THREE.Group(); grp.position.set(x, y, z);
    grp.rotation.y = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 }[face];
    box(w + 0.2, h + 0.2, 0.12, 0, 0, 0.05, WHITE, grp);
    box(w, h, 0.14, 0, 0, 0.06, GLASS, grp);
    box(0.06, h, 0.16, 0, 0, 0.07, WHITE, grp);
    g.add(grp);
  }
  const floorsY = [BASE + 1.6, BASE + 4.1];
  for (const x of [-7.5, -3.5, 1, 5, 8.5]) for (const y of floorsY) win(x, y, -mainW / 2 - 0.05, 'N');   // norrfasad
  for (const z of [-2, 2]) for (const y of floorsY) { win(mainL / 2 + 0.05, y, z, 'E'); }                    // östgavel
  for (const z of [-1.4, 1.4]) win(mainL / 2 + 0.05, H + 1.2, z, 'E', 0.9, 1.2);
  for (const z of [-2, 2]) for (const y of floorsY) win(-mainL / 2 - 0.05, y, z, 'W');                       // västgavel
  for (const x of [-8.5, -5.5]) { win(x, floorsY[0], 9.25, 'S'); win(x, floorsY[1], 9.25, 'S'); }          // flygelns gavel
  win(-7, H + 1.2, 9.25, 'S', 0.9, 1.2);
  for (const x of [0, 3.5, 7]) { win(x, floorsY[1], 4.25, 'S'); }                                             // ovanför verandan

  // ---- Veranda på söderfasaden (höger om flygeln) ----
  const px0 = -2, px1 = 10, pz1 = 7.8;
  box(px1 - px0, 0.3, pz1 - 4.2, (px0 + px1) / 2, BASE - 0.15, (4.2 + pz1) / 2, 0xb08a5a);                  // altangolv
  box(px1 - px0 + 0.4, 0.3, pz1 - 4.2 + 0.2, (px0 + px1) / 2, BASE + 3.2, (4.2 + pz1) / 2 + 0.1, WHITE);    // takplatta
  for (const x of [-1.6, 2, 5.6, 9.6]) cyl(0.23, 3.2, x, BASE + 1.6, pz1 - 0.3, WHITE);                     // kolonner
  box(px1 - px0, 0.05, 0.05, (px0 + px1) / 2, BASE + 1.0, pz1 - 0.3, 0x1a1a1a);                             // räcke
  win(2, BASE + 1.5, 4.25, 'S', 1.1, 1.6); win(6, BASE + 1.5, 4.25, 'S', 1.1, 1.6);
  // Trappa ned från verandan
  for (let i = 0; i < 5; i++) box(2.6, 0.2, 0.5, 5.4, BASE - 0.4 - i * 0.4, pz1 + 0.5 + i * 0.5, 0xa5763d);

  // ---- Altan över garaget (norrsidan) ----
  box(mainL, 0.3, 4, 0, BASE - 0.15, -mainW / 2 - 2, 0xc7a97a);
  for (const x of [-9.7, -3.3, 3.3, 9.7]) cyl(0.22, BASE, x, BASE / 2, -mainW / 2 - 3.8, WHITE);
  box(mainL, 0.06, 0.06, 0, BASE + 1.05, -mainW / 2 - 3.95, 0x1a1a1a);
  for (let x = -9.9; x <= 9.9; x += 0.35) box(0.03, 1.0, 0.03, x, BASE + 0.5, -mainW / 2 - 3.95, 0x1a1a1a);
  for (const x of [-6.5, -1.5]) box(3.4, 2.0, 0.12, x, 1.0, -mainW / 2 - 0.05, 0x23262b);                    // garageportar
  // Gröna källardörrar på östgaveln
  for (const z of [-1.6, 1.6]) box(0.12, 1.9, 1.5, mainL / 2 + 0.05, 0.95, z, 0x6d7f74);

  // ---- Poolsidan (öster) ----
  box(8, 0.3, 9, 14, 0.15, 0, 0x7a5a3a);                                                                    // trädäck
  cyl(1.5, 0.9, 14.5, 0.75, -1.5, 0x3a3f47, 32);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32).rotateX(-Math.PI / 2), M(0x2a8fc0)); water.position.set(14.5, 1.21, -1.5); g.add(water);
  for (const z of [-3.5, 3.5]) box(0.2, 3.0, 0.2, 11.5, 1.5, z, 0x8b5a2b);                                  // pergola
  box(0.15, 0.2, 7.4, 11.5, 3.0, 0, 0x8b5a2b);

  // ---- Stenmur, stenar, häck, träd ----
  for (let x = -14; x < 8; x += 1.3) box(1.3, 1.0 + rnd() * 0.2, 0.7, x, 0.55, -12.5, 0x6b6b66);              // stenmur norr om altanen
  for (let x = -11; x < 5; x += 2.1) {                                                                       // stenar framför
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.7 + rnd() * 0.35, 10, 8), M(0xa9826a));
    s.position.set(x, 0.35, 11.2 + rnd() * 0.6); s.scale.y = 0.7; g.add(s);
  }
  for (let z = 4; z <= 10; z += 1.6) {                                                                       // tujahäck
    const h = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), M(0x3d5a2c));
    h.position.set(12 + rnd(), 1.1, z); h.scale.set(0.9, 1.1, 1); g.add(h);
  }
  const tree = (x, z, kind) => {
    const h = 6 + rnd() * 5;
    if (kind === 'pine') {
      cyl(0.25, h * 0.6, x, h * 0.3, z, 0x5a4330, 8);
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(2 - i * 0.4, h * 0.45, 8), M(0x2f5a2c)); c.position.set(x, h * 0.55 + i * h * 0.17, z); g.add(c); }
    } else {
      cyl(0.18, h * 0.55, x, h * 0.28, z, 0xe8e4dc, 8);
      const c = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), M(0x6aa043)); c.position.set(x, h * 0.65, z); g.add(c);
    }
  };
  [[-18, -14], [-12, -16], [-3, -17], [6, -16], [14, -14], [19, -8], [19, 6], [17, 15], [-19, -4], [-20, 10], [-16, 16], [-4, 18], [8, 19]]
    .forEach(([x, z], i) => tree(x, z, i % 3 === 0 ? 'birch' : 'pine'));

  return g;
}
