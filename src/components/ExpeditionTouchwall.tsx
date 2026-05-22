import { Html, Line, OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronRight, MapPin, Thermometer, Timer, Waves, Wind, X } from "lucide-react";
import { Suspense, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// ─── Wolkenvrije NASA Blue Marble texture ─────────────────────────────────────
const EARTH_TEXTURE_URL = "https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg";

// ─── Types ────────────────────────────────────────────────────────────────────
type HotspotId = "antwerp" | "cape" | "antarctica";

type ExpeditionStop = {
  id: HotspotId;
  name: string;
  label: string;
  date: string;
  lat: number;
  lon: number;
  progress: number;
  temperature: string;
  wind: string;
  duration: string;
  note: string;
  facts: string[];
  photos: string[];
};

type Passage = {
  label: string;
  name: string;
  date: string;
  temperature: string;
  wind: string;
  duration: string;
};

type GlobeSceneProps = {
  progress: number;
  activeStop: ExpeditionStop | null;
  onHotspotClick: (stop: ExpeditionStop) => void;
};

// ─── Expeditiedata ────────────────────────────────────────────────────────────
const expeditionStops: ExpeditionStop[] = [
  {
    id: "antwerp",
    name: "Antwerpen",
    label: "Vertrekhaven",
    date: "16 aug 1897",
    lat: 51.2194,
    lon: 4.4025,
    progress: 0.04,
    temperature: "7°C",
    wind: "12 kn",
    duration: "0 weken",
    note: "De Belgica verlaat Antwerpen op 16 augustus 1897 onder leiding van Adrien de Gerlache. Een bemanning van veertien man en zeven wetenschappers gaat de poolgeschiedenis in.",
    facts: [
      "Eerste Belgische wetenschappelijke poolexpeditie",
      "Route via Atlantische Oceaan naar het zuiden",
      "Roald Amundsen diende als eerste stuurman",
    ],
    photos: ["Belgica in de haven", "Bemanning aan dek", "Instrumenten", "Vertrekmoment"],
  },
  {
    id: "cape",
    name: "Kaapstad",
    label: "Bevoorrading",
    date: "22 okt 1897",
    lat: -33.9249,
    lon: 18.4241,
    progress: 0.55,
    temperature: "15°C",
    wind: "24 kn",
    duration: "12 weken",
    note: "Laatste grote zuidelijke havenstop voor de oversteek naar de Zuidelijke IJszee. Scheepsreparaties en aanvulling van proviand voor de gevaarlijke oversteek.",
    facts: [
      "Zeventien dagen stop voor reparaties en bevoorrading",
      "Frederick Cook behandelt zieke bemanningsleden",
      "Stormwaarschuwingen voor de route richting het zuiden",
    ],
    photos: ["Tafelberg vanuit zee", "Inladen voorraden", "Havenkaart", "Scheepslogboek"],
  },
  {
    id: "antarctica",
    name: "Antarctica",
    label: "Pakijsgevangenschap",
    date: "28 feb 1898",
    lat: -64.05,
    lon: -62.97,
    progress: 0.94,
    temperature: "−43°C",
    wind: "68 kn",
    duration: "377 dagen",
    note: "Op 28 februari 1898 raakt de Belgica vast in het pakijs van de Bellingshausenzee. Het schip overwintert gedwongen — de allereerste expeditie ooit die dit doet.",
    facts: [
      "Eerste overwintering ooit onder de Zuidpoolcirkel",
      "Cruciale meteorologische en magnetische observaties",
      "Cook en Amundsen zorgden voor overleving van de bemanning",
    ],
    photos: ["Belgica in het pakijs", "Poolnacht", "Wetenschappelijk onderzoek", "Bevrijding 1899"],
  },
];

const passages: Array<Passage & { from: number }> = [
  { from: 0,    label: "Vertrekhaven",       name: "Antwerpen",  date: "aug 1897", temperature: "7°C",   wind: "12 kn", duration: "Week 0" },
  { from: 0.22, label: "Atlantische passage", name: "Zuidwaarts", date: "sep 1897", temperature: "18°C",  wind: "28 kn", duration: "6 weken" },
  { from: 0.48, label: "Bevoorrading",        name: "Kaapstad",   date: "okt 1897", temperature: "15°C",  wind: "24 kn", duration: "12 weken" },
  { from: 0.72, label: "Zuidelijke Oceaan",   name: "Stormzone",  date: "dec 1897", temperature: "2°C",   wind: "54 kn", duration: "20 weken" },
  { from: 0.92, label: "Pakijsgevangenschap", name: "Antarctica", date: "feb 1898", temperature: "−43°C", wind: "68 kn", duration: "377 dagen" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function latLonToVector3(lat: number, lon: number, radius = 2.08) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function makeArcPoints(stops: ExpeditionStop[]) {
  const segments: [ExpeditionStop, ExpeditionStop][] = [
    [stops[0], stops[1]],
    [stops[1], stops[2]],
  ];
  return segments.flatMap(([start, end], si) =>
    Array.from({ length: 72 }, (_, i) => {
      const t = i / 71;
      const sv = latLonToVector3(start.lat, start.lon, 2.1).normalize();
      const ev = latLonToVector3(end.lat, end.lon, 2.1).normalize();
      const angle = sv.angleTo(ev);
      const sin = Math.sin(angle);
      const p = sv
        .clone()
        .multiplyScalar(Math.sin((1 - t) * angle) / sin)
        .add(ev.clone().multiplyScalar(Math.sin(t * angle) / sin))
        .normalize();
      const alt = 2.11 + Math.sin(t * Math.PI) * 0.18;
      return p.multiplyScalar(alt + si * 0.003);
    }),
  );
}

function getPassage(progress: number): Passage {
  return passages.reduce<Passage>(
    (cur, p) => (progress >= p.from ? p : cur),
    passages[0],
  );
}

// ─── Globe Shaders ────────────────────────────────────────────────────────────
const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = viewPos.xyz;
    gl_Position = projectionMatrix * viewPos;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D earthMap;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 tex = texture2D(earthMap, vUv).rgb;
    float lum = dot(tex, vec3(0.299, 0.587, 0.114));

    // Antarctica: south pole = bottom of equirectangular map (vUv.y near 0)
    float antZone = smoothstep(0.22, 0.07, vUv.y);
    float iceDetect = smoothstep(0.58, 0.78, lum);
    float ice = max(antZone * smoothstep(0.32, 0.55, lum), iceDetect * smoothstep(0.14, 0.06, vUv.y));

    // Ocean detection: blue-dominant pixels
    float blueDom = (tex.b - max(tex.r, tex.g)) / (lum + 0.001);
    float isOcean = smoothstep(0.05, 0.22, blueDom) * (1.0 - ice);

    // Deep blue ocean palette
    vec3 deepOcean = mix(vec3(0.04, 0.10, 0.30), vec3(0.02, 0.06, 0.22), 1.0 - lum);
    vec3 ocean = mix(tex * 0.75, deepOcean, 0.72);

    // Land: natural earth tones, slight brightness boost
    vec3 land = tex * 1.22;
    land = clamp(land, 0.0, 1.0);

    // Pure ice white for Antarctica
    vec3 iceColor = vec3(0.94, 0.97, 1.0);

    // Compose layers
    vec3 color = mix(land, ocean, isOcean);
    color = mix(color, iceColor, ice);

    // Atmospheric Fresnel — soft blue glow at planet edge
    vec3 viewDir = normalize(-vViewPosition);
    float rim = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 3.2);
    color += vec3(0.08, 0.30, 0.90) * rim * 1.4;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Separate atmosphere shader (additive glow sphere, slightly larger)
const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 vp = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = vp.xyz;
    gl_Position = projectionMatrix * vp;
  }
`;
const ATMO_FRAG = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 viewDir = normalize(-vViewPosition);
    float rim = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.4);
    gl_FragColor = vec4(0.12, 0.38, 1.0, rim * 0.38);
  }
`;

// ─── EarthGlobe scene component ───────────────────────────────────────────────
function EarthGlobe({ progress, activeStop, onHotspotClick }: GlobeSceneProps) {
  const earthMap    = useTexture(EARTH_TEXTURE_URL);
  const groupRef    = useRef<THREE.Group>(null);
  const pathPoints  = useMemo(() => makeArcPoints(expeditionStops), []);

  // Individual halo refs per hotspot for independent pulsing
  const haloRefs  = useRef<(THREE.Mesh | null)[]>([null, null, null]);
  const halo2Refs = useRef<(THREE.Mesh | null)[]>([null, null, null]);

  const earthMaterial = useMemo(() => {
    earthMap.colorSpace = THREE.SRGBColorSpace;
    return new THREE.ShaderMaterial({
      uniforms: { earthMap: { value: earthMap } },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    });
  }, [earthMap]);

  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {},
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        depthWrite: false,
      }),
    [],
  );

  const visiblePath = useMemo(() => {
    const count = Math.max(2, Math.ceil(pathPoints.length * progress));
    return pathPoints.slice(0, count);
  }, [pathPoints, progress]);

  useFrame(({ camera, clock }) => {
    // Globe rotation to follow expedition progress
    if (groupRef.current) {
      const idx = Math.min(
        pathPoints.length - 1,
        Math.max(0, Math.floor(progress * (pathPoints.length - 1))),
      );
      const focusVec = pathPoints[idx].clone().normalize();
      const target   = new THREE.Quaternion().setFromUnitVectors(
        focusVec,
        new THREE.Vector3(0, 0, 1),
      );
      groupRef.current.quaternion.slerp(target, 0.085);
    }

    // Camera gentle zoom-in toward Antarctica at 100%
    const eased = 1 - Math.pow(1 - progress, 2.25);
    const targetZ = THREE.MathUtils.lerp(6.65, 5.5, eased);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.075);
    camera.lookAt(0, 0, 0);

    // Pulsing halo rings — ripple effect, staggered per hotspot
    const t = clock.elapsedTime;
    haloRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const phase = t * 2.4 + i * 1.1;
      const s = 1 + Math.sin(phase) * 0.32;
      mesh.scale.setScalar(s);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.18 + Math.sin(phase) * 0.10;
    });
    halo2Refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const phase = t * 2.4 + i * 1.1 + Math.PI; // opposite phase
      const s = 1 + Math.sin(phase) * 0.28;
      mesh.scale.setScalar(s);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.08 + Math.sin(phase) * 0.06;
    });
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 3, 4]} intensity={2.2} color="#fff8f0" />
      <pointLight position={[-4, -2, 3]} intensity={2.8} color="#2255ff" />

      {/* Stars */}
      <Stars radius={100} depth={40} count={2200} factor={3.5} fade speed={0.14} />

      {/* Atmosphere glow (outside the group so it doesn't rotate) */}
      <mesh>
        <sphereGeometry args={[2.18, 64, 64]} />
        <primitive object={atmosphereMaterial} attach="material" />
      </mesh>

      {/* Earth group (rotates to follow route) */}
      <group ref={groupRef}>
        {/* Globe */}
        <mesh>
          <sphereGeometry args={[2, 128, 128]} />
          <primitive object={earthMaterial} attach="material" />
        </mesh>

        {/* Expedition path */}
        {visiblePath.length >= 2 && (
          <>
            {/* Core red line */}
            <Line points={visiblePath} color="#ef4444" lineWidth={3.5} transparent opacity={0.92} />
            {/* Soft glow bloom */}
            <Line points={visiblePath} color="#ff8080" lineWidth={10} transparent opacity={0.22} />
          </>
        )}

        {/* Hotspot markers */}
        {expeditionStops.map((stop, i) => {
          const available = progress + 0.035 >= stop.progress;
          const active    = activeStop?.id === stop.id;
          const pos       = latLonToVector3(stop.lat, stop.lon, 2.28);

          return (
            <group
              key={stop.id}
              position={pos}
              visible={available}
              onClick={() => onHotspotClick(stop)}
            >
              {/* Outer ripple halo 2 (large, slow) */}
              <mesh ref={(el) => { halo2Refs.current[i] = el; }}>
                <sphereGeometry args={[0.22, 32, 32]} />
                <meshBasicMaterial color="#ef4444" transparent opacity={0.10} />
              </mesh>

              {/* Inner ripple halo (medium, faster) */}
              <mesh ref={(el) => { haloRefs.current[i] = el; }}>
                <sphereGeometry args={[0.155, 32, 32]} />
                <meshBasicMaterial color="#ef4444" transparent opacity={0.20} />
              </mesh>

              {/* Solid core dot */}
              <mesh>
                <sphereGeometry args={[active ? 0.075 : 0.062, 32, 32]} />
                <meshBasicMaterial color={active ? "#ff8080" : "#ef4444"} />
              </mesh>

              {/* Readable label — white text, drop shadow, no balloon */}
              <Html
                center
                distanceFactor={14}
                position={[0, 0.26, 0]}
                className="pointer-events-none select-none"
              >
                <div
                  style={{
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.92)",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      textShadow:
                        "0 1px 3px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.8), 0 0 24px rgba(0,0,0,0.5)",
                      lineHeight: 1,
                    }}
                  >
                    {stop.name}
                  </span>
                </div>
              </Html>
            </group>
          );
        })}
      </group>

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        rotateSpeed={0.22}
        minPolarAngle={0.95}
        maxPolarAngle={2.1}
      />
    </>
  );
}

// ─── Globe loading fallback ───────────────────────────────────────────────────
function GlobeLoading() {
  return (
    <Html center>
      <div className="museum-glass px-5 py-3 text-xs font-medium uppercase tracking-[0.28em] text-white/60">
        Globe laden…
      </div>
    </Html>
  );
}

// ─── Reusable data-snapshot card ──────────────────────────────────────────────
function DataCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">
        {icon}
        {label}
      </span>
      <span className="text-base font-medium text-white">{value}</span>
    </div>
  );
}

// ─── Main touchwall ───────────────────────────────────────────────────────────
export function ExpeditionTouchwall() {
  const [progress, setProgress]     = useState(0);
  const [activeStop, setActiveStop] = useState<ExpeditionStop | null>(null);
  const currentPassage              = getPassage(progress);

  return (
    <main className="touchwall-shell relative isolate flex min-h-screen overflow-hidden text-white">

      {/* ── Full-screen globe canvas ── */}
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0, 6.65], fov: 39 }}
          dpr={[1, 1.8]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <Suspense fallback={<GlobeLoading />}>
            <EarthGlobe
              progress={progress}
              activeStop={activeStop}
              onHotspotClick={setActiveStop}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* ════════════════════════════════════════════
          HEADER — top-left corner
      ════════════════════════════════════════════ */}
      <header className="pointer-events-none absolute left-0 top-0 z-20 px-10 py-9 md:px-12 md:py-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.36em] text-white/40">
          Antwerpen — Kaapstad — Antarctica
        </p>
        <h1 className="mt-2 text-5xl font-thin uppercase leading-none tracking-widest md:text-6xl">
          Belgica Expedition
        </h1>
        <p className="mt-1.5 text-sm font-medium tracking-[0.22em] text-white/35">
          1897 — 1899
        </p>
      </header>

      {/* ════════════════════════════════════════════
          LEFT PANEL — Huidige passage
          (extreme left, vertically centered)
      ════════════════════════════════════════════ */}
      <aside className="pointer-events-none absolute left-8 top-1/2 z-20 hidden -translate-y-1/2 md:block lg:left-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPassage.label}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="museum-glass w-56 rounded-lg p-5 lg:w-64"
          >
            <p className="text-[10px] font-medium uppercase tracking-[0.36em] text-white/40">
              Huidige passage
            </p>
            <p className="mt-3 text-xl font-thin leading-snug tracking-wide">
              {currentPassage.label}
            </p>
            <p className="mt-0.5 text-sm font-medium text-white/55">
              {currentPassage.name}
            </p>

            <div className="my-4 h-px w-full bg-white/10" />

            {/* Data rows */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-white/45">
                  <Thermometer className="h-3.5 w-3.5 text-red-400" />
                  Temperatuur
                </span>
                <span className="font-medium text-white">{currentPassage.temperature}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-white/45">
                  <Wind className="h-3.5 w-3.5 text-blue-400" />
                  Windkracht
                </span>
                <span className="font-medium text-white">{currentPassage.wind}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-white/45">
                  <Timer className="h-3.5 w-3.5 text-white/35" />
                  Reisduur
                </span>
                <span className="font-medium text-white">{currentPassage.duration}</span>
              </div>
            </div>

            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/30">
                {currentPassage.date}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </aside>

      {/* ════════════════════════════════════════════
          RIGHT PANEL — hotspot detail
          (slides in from extreme right)
      ════════════════════════════════════════════ */}
      <AnimatePresence>
        {activeStop && (
          <motion.aside
            key={activeStop.id}
            initial={{ opacity: 0, x: 56 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 56 }}
            transition={{ type: "spring", stiffness: 140, damping: 26 }}
            className="museum-panel absolute right-8 top-1/2 z-30 flex max-h-[82vh] w-[min(340px,calc(100vw-4rem))] -translate-y-1/2 flex-col overflow-hidden rounded-xl lg:right-10 lg:w-[360px]"
          >
            {/* Header band */}
            <div className="flex-none border-b border-white/10 px-6 pt-6 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-red-400">
                    Hotspot — {activeStop.label}
                  </p>
                  <h2 className="mt-2 text-2xl font-thin uppercase leading-tight tracking-wide">
                    {activeStop.name}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-white/45">{activeStop.date}</p>
                </div>
                <button
                  aria-label="Sluit"
                  onClick={() => setActiveStop(null)}
                  className="pointer-events-auto mt-1 flex-none rounded-full border border-white/15 bg-white/8 p-2 text-white/50 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Data snapshots */}
              <div className="grid grid-cols-3 gap-2">
                <DataCard
                  icon={<Thermometer className="h-3 w-3" />}
                  label="Temp"
                  value={activeStop.temperature}
                />
                <DataCard
                  icon={<Wind className="h-3 w-3" />}
                  label="Wind"
                  value={activeStop.wind}
                />
                <DataCard
                  icon={<Timer className="h-3 w-3" />}
                  label="Duur"
                  value={activeStop.duration}
                />
              </div>

              {/* Toelichting */}
              <p className="text-sm font-medium leading-6 text-white/60">
                {activeStop.note}
              </p>

              {/* Foto-galerij */}
              <div>
                <p className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.28em] text-white/35">
                  Historische foto's
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {activeStop.photos.map((photo, index) => (
                    <button
                      key={photo}
                      className="pointer-events-auto group relative aspect-[4/3] overflow-hidden rounded-md border border-white/10 bg-white/5 transition hover:border-white/25 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-red-400/50"
                    >
                      {/* Placeholder gradient simulating a photo */}
                      <div
                        className="absolute inset-0 opacity-40"
                        style={{
                          background: [
                            "linear-gradient(135deg,#1e3a5f,#0a1628)",
                            "linear-gradient(135deg,#2d4a1e,#0f1f09)",
                            "linear-gradient(135deg,#3d2a0a,#1a1008)",
                            "linear-gradient(135deg,#1a2a3d,#0a0f1a)",
                          ][index % 4],
                        }}
                      />
                      <div className="absolute inset-0 flex flex-col justify-end p-2">
                        <Camera className="mb-1 h-3.5 w-3.5 text-white/30 transition group-hover:text-white/50" />
                        <span className="text-[9px] font-medium uppercase tracking-[0.16em] leading-tight text-white/50">
                          {photo}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Feiten */}
              <div>
                <p className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.28em] text-white/35">
                  Historische feiten
                </p>
                <div className="space-y-2.5">
                  {activeStop.facts.map((fact) => (
                    <div key={fact} className="flex gap-3 border-t border-white/8 pt-2.5">
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-red-400/70" />
                      <p className="text-sm font-medium leading-5 text-white/55">{fact}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ════════════════════════════════════════════
          BOTTOM — tijdlijn, full 21:9 width
      ════════════════════════════════════════════ */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
        {/* Gradient fade from bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

        <div className="relative px-10 pb-8 pt-28 md:px-12">
          {/* Progress row */}
          <div className="mb-5 flex items-end justify-between gap-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/40">
                Tijdlijn route
              </p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentPassage.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="mt-1.5 text-xl font-thin tracking-wide"
                >
                  {currentPassage.label}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-3">
              <Waves className="h-4 w-4 text-blue-400/50" />
              <span className="text-3xl font-thin tabular-nums text-white/70">
                {Math.round(progress * 100)}
                <span className="text-lg text-white/35">%</span>
              </span>
            </div>
          </div>

          {/* ── Slider ── */}
          <input
            aria-label="Expeditie tijdlijn"
            className="expedition-range pointer-events-auto"
            min="0"
            max="100"
            type="range"
            value={Math.round(progress * 100)}
            style={{ "--progress": `${progress * 100}%` } as React.CSSProperties}
            onChange={(e) => {
              const v = Number(e.currentTarget.value) / 100;
              setProgress(v);
              if (activeStop && v + 0.035 < activeStop.progress) setActiveStop(null);
            }}
          />

          {/* Timeline date labels */}
          <div className="mt-2 flex justify-between">
            {passages.map((p) => (
              <span
                key={p.from}
                className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/25"
              >
                {p.date}
              </span>
            ))}
          </div>

          {/* Stop buttons */}
          <div className="mt-4 flex justify-between">
            {expeditionStops.map((stop) => {
              const reached = progress + 0.035 >= stop.progress;
              return (
                <button
                  key={stop.id}
                  onClick={() => {
                    setProgress(stop.progress);
                    setActiveStop(stop);
                  }}
                  className="pointer-events-auto group flex flex-col items-center gap-1.5 transition focus:outline-none"
                >
                  <MapPin
                    className="h-4 w-4 transition-colors"
                    style={{ color: reached ? "#ef4444" : "rgba(255,255,255,0.22)" }}
                  />
                  <span
                    className="text-[10px] font-medium uppercase tracking-[0.22em] transition-colors"
                    style={{
                      color: reached ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)",
                    }}
                  >
                    {stop.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </footer>
    </main>
  );
}