import { refreshLogos } from "../lib/logos";
refreshLogos().then((r) => console.log(`logos cached: ${r.fetched} fetched, ${r.withLogo} with a real logo`));
