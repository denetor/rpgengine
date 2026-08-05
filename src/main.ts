import { bootstrap } from "./game/bootstrap";
import { boot } from "./presentation/boot";

// The browser entry point, and the one file that belongs to no layer: it calls
// the game's bootstrap and hands what it returns to the presentation's boot. It
// is the single declared hole in the boundary check, and it stays small enough
// that reading it is the whole audit.

void boot(bootstrap());
