import type { TemplateResult } from "lit";
import type { TopBarAction } from "../components.js";

// What every screen hands the shell: its top bar and its body, plus an
// optional overlay (a sheet or dialog) drawn above everything.
export interface View {
  title: string | null;
  back: boolean;
  actions: TopBarAction[];
  body: TemplateResult;
  overlay?: TemplateResult;
}
