import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
/* The stage is flat colour and type, and the camera moves on almost every
   frame, so inter-frame compression has little to reuse. A higher CRF is what
   keeps this a page asset rather than a 5MB one. */
Config.setCrf(26);
Config.setEntryPoint("remotion/index.ts");

Config.overrideWebpackConfig((current) => {
  const withTailwind = enableTailwind(current);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...withTailwind.resolve?.alias,
        "@": path.join(process.cwd()),
      },
    },
  };
});
