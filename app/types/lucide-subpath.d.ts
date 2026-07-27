// lucide-react (^1.16.0) ships per-icon ESM files under `dist/esm/icons/*` but
// no type declarations for those subpaths. Several pages import icons this way
// deliberately, to sidestep a Turbopack tree-shaking issue with the barrel
// import. This wildcard declaration lets TypeScript resolve those subpath
// imports as React SVG components.

declare module "lucide-react/dist/esm/icons/*" {
  import { FC, SVGProps } from "react";
  const Icon: FC<
    SVGProps<SVGSVGElement> & {
      size?: string | number;
      absoluteStrokeWidth?: boolean;
    }
  >;
  export default Icon;
}
