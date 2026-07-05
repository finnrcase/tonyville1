/**
 * The staged customer flow: one question, one decision, one visual per scene.
 * Scene chrome (progress dots, back/continue placement) is driven from this
 * single list so every screen stays consistent.
 */

export type FlowStep = {
  id: string;
  label: string;
};

export const FLOW_STEPS: FlowStep[] = [
  { id: "use-case", label: "Room" },
  { id: "recommended", label: "CABN" },
  { id: "address", label: "Address" },
  { id: "property", label: "Property" },
  { id: "place", label: "Place" },
  { id: "window", label: "Window" },
  { id: "door", label: "Door" },
  { id: "desk", label: "Desk" },
  { id: "built-ins", label: "Built-ins" },
  { id: "review", label: "Review" },
];

export function flowStepNumber(id: string): number {
  const index = FLOW_STEPS.findIndex((step) => step.id === id);
  return index === -1 ? 1 : index + 1;
}
