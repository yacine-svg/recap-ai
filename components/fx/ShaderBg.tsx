"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/*
 * Animated ShaderGradient background (three.js water-plane shader).
 * Loaded only in the browser, only when WebGL works and the visitor has not
 * asked for reduced motion; otherwise the CSS gradient underneath shows.
 */

type Loose = React.ComponentType<Record<string, unknown> & { children?: React.ReactNode }>;

const Canvas = dynamic(async () => (await import("@shadergradient/react")).ShaderGradientCanvas as unknown as Loose, { ssr: false });
const Gradient = dynamic(async () => (await import("@shadergradient/react")).ShaderGradient as unknown as Loose, { ssr: false });

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function ShaderBg({ calm = false }: { calm?: boolean }) {
  const [on, setOn] = useState(false);
  const [density, setDensity] = useState(1);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!reduced && !saveData && webglOk()) {
      setDensity(window.innerWidth < 760 ? 0.7 : Math.min(1.2, window.devicePixelRatio || 1));
      setOn(true);
    }
  }, []);

  return (
    <div className="hero-bg" aria-hidden="true">
      {on && (
        <Canvas style={{ position: "absolute", inset: 0, pointerEvents: "none" }} pixelDensity={density} fov={45} pointerEvents="none">
          <Gradient
            control="props"
            type="waterPlane"
            animate="on"
            uTime={0}
            uSpeed={calm ? 0.08 : 0.14}
            uStrength={2.2}
            uDensity={1.3}
            uFrequency={5.5}
            uAmplitude={1}
            color1="#2e36e8"
            color2="#8b3dff"
            color3="#0d1033"
            brightness={1.05}
            grain="on"
            lightType="3d"
            envPreset="city"
            reflection={0.1}
            cAzimuthAngle={180}
            cPolarAngle={80}
            cDistance={2.8}
            cameraZoom={9.1}
            positionX={0}
            positionY={0}
            positionZ={0}
            rotationX={50}
            rotationY={0}
            rotationZ={-60}
            wireframe={false}
          />
        </Canvas>
      )}
    </div>
  );
}
