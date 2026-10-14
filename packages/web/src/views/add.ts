import { html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import { addPerson, state, toast, update, type AddForm } from "../state.js";
import type { View } from "./view.js";

const orNull = (text: string) => text.trim() || null;

export function addView(): View {
  const form = state.addForm;
  const set = (patch: Partial<AddForm>) => update(() => Object.assign(form, patch));
  const valid = form.name.trim() !== "" && (!form.hasBirthday || form.birthday !== "");
  const text = (key: "name" | "phone" | "email" | "howIKnowThem", label: string, type = "text", autocomplete = "off") =>
    html`<label class="field">
      <span>${label}</span>
      <input
        class="input"
        type=${type}
        autocomplete=${autocomplete}
        maxlength=${key === "howIKnowThem" ? 2000 : 200}
        .value=${live(form[key])}
        @input=${(e: InputEvent) => set({ [key]: (e.target as HTMLInputElement).value })}
      />
    </label>`;

  const save = async () => {
    if (!valid) return;
    const person = await addPerson({
      name: form.name.trim(),
      phone: orNull(form.phone),
      email: orNull(form.email),
      howIKnowThem: orNull(form.howIKnowThem),
      birthday: form.hasBirthday ? form.birthday : null,
      birthYearUnknown: form.hasBirthday && form.birthYearUnknown,
    });
    if (person) toast(`Added ${person.name} to People.`);
  };

  return {
    title: "Add person",
    back: false,
    actions: [],
    body: html`<div class="page form">
      ${text("name", "Name")} ${text("phone", "Phone", "tel", "tel")} ${text("email", "Email", "email", "email")}
      ${text("howIKnowThem", "How I know them")}
      <label class="check">
        <input type="checkbox" .checked=${live(form.hasBirthday)} @change=${(e: Event) => set({ hasBirthday: (e.target as HTMLInputElement).checked })} />
        Has a known birthday
      </label>
      ${form.hasBirthday
        ? html`<label class="field">
              <span>Birthday</span>
              <input class="input" type="date" .value=${live(form.birthday)} @input=${(e: InputEvent) => set({ birthday: (e.target as HTMLInputElement).value })} />
            </label>
            <label class="check">
              <input
                type="checkbox"
                .checked=${live(form.birthYearUnknown)}
                @change=${(e: Event) => set({ birthYearUnknown: (e.target as HTMLInputElement).checked })}
              />
              Year unknown
            </label>`
        : nothing}
      <button class="btn" ?disabled=${!valid || state.busy} @click=${save}>Save</button>
    </div>`,
  };
}
