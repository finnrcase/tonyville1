export type CABNAnswerType =
  | "single_choice"
  | "multi_choice"
  | "address"
  | "placement"
  | "confirmation"
  | "custom";

export type CABNSceneOption = {
  id: string;
  label: string;
  description?: string;
  image?: string;
  icon?: string;
  metadata?: Record<string, string | number | boolean | string[] | undefined>;
};

export type CABNScene = {
  id: string;
  order: number;
  phase: "dream" | "make_it_yours";
  title: string;
  subtitle?: string;
  emotionalObjective: string;
  philosophicalObjective: string;
  dataObjective: string;
  question?: string;
  answerType?: CABNAnswerType;
  options?: CABNSceneOption[];
  nextSceneId?: string;
};

export const cabnScenes: CABNScene[] = [
  {
    id: "dream_use_case",
    order: 1,
    phase: "dream",
    title: "What do you want your extra space to become?",
    subtitle: "Fall in love with the room first. Then Tonyville adapts it to the property.",
    emotionalObjective: "Help the customer imagine the life change before logistics.",
    philosophicalObjective: "The product begins with desire, not constraint.",
    dataObjective: "Capture intended use so CABN can recommend a room model.",
    question: "What do you want your extra space to become?",
    answerType: "single_choice",
    nextSceneId: "dream_recommendation",
    options: [
      {
        id: "office",
        label: "Office",
        description: "quiet office",
        icon: "briefcase",
        image:
          "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=82",
        metadata: {
          modelId: "cabn-160",
          recommendedStyle: "modern",
          headline: "A focused workroom that feels separate from the house.",
          description:
            "A calm, bright backyard office with room for a real desk, storage wall, and soft natural light without the daily commute.",
          imageAlt: "Modern light-filled work studio interior",
          details: ["Desk wall", "Quiet calls", "North-light friendly"],
        },
      },
      {
        id: "guest-room",
        label: "Guest room",
        description: "guest retreat",
        icon: "bed",
        image:
          "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1400&q=82",
        metadata: {
          modelId: "cabn-200",
          recommendedStyle: "luxury-guest-suite",
          headline: "A guest suite that makes people want to stay longer.",
          description:
            "A polished private room for visiting family, weekend guests, or a soft landing that still keeps everyone comfortable.",
          imageAlt: "Premium warm guest room interior",
          details: ["Sleeping zone", "Privacy-first windows", "Hotel-like finish"],
        },
      },
      {
        id: "studio",
        label: "Studio",
        description: "maker studio",
        icon: "camera",
        image:
          "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1400&q=82",
        metadata: {
          modelId: "cabn-200",
          recommendedStyle: "minimal",
          headline: "A clean studio for deep work, shoots, and making things.",
          description:
            "Open wall space, controllable light, and a simple footprint that can flex from production days to quiet sketching.",
          imageAlt: "Minimal creative studio with sculptural architecture",
          details: ["Open wall", "Gear storage", "Flexible light"],
        },
      },
      {
        id: "gym",
        label: "Gym",
        description: "private gym",
        icon: "dumbbell",
        image:
          "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=82",
        metadata: {
          modelId: "cabn-200",
          recommendedStyle: "garden-studio",
          headline: "A private training room a few steps from your door.",
          description:
            "A clean, durable space for movement, recovery, and routines that actually survive busy weeks.",
          imageAlt: "Premium private gym space",
          details: ["Durable floor", "Mirror wall", "Morning access"],
        },
      },
      {
        id: "rental",
        label: "Rental / ADU-style use",
        description: "ADU-style suite",
        icon: "key",
        image:
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=82",
        metadata: {
          modelId: "cabn-480",
          recommendedStyle: "luxury-guest-suite",
          headline: "A smarter extra suite for family, guests, or income.",
          description:
            "A larger concept for customers thinking beyond a spare room, with the right caveat: zoning and utilities lead the final decision.",
          imageAlt: "Modern small home exterior in warm evening light",
          details: ["Larger plan", "Utility-led review", "Permit-sensitive"],
        },
      },
      {
        id: "creative-space",
        label: "Creative space",
        description: "creative room",
        icon: "palette",
        image:
          "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1400&q=82",
        metadata: {
          modelId: "cabn-160",
          recommendedStyle: "warm-wood",
          headline: "A personal room for the version of you that needs space.",
          description:
            "A warm, tactile studio for music, writing, painting, or the hobby that keeps getting squeezed into the corners.",
          imageAlt: "Warm wood creative room with natural light",
          details: ["Acoustic feel", "Built-ins", "Soft privacy"],
        },
      },
    ],
  },
  {
    id: "dream_recommendation",
    order: 2,
    phase: "dream",
    title: "Recommended CABN room",
    subtitle: "Show the ideal room, model, starting price, and why it matches.",
    emotionalObjective: "Convert intent into a room the customer can picture.",
    philosophicalObjective: "Recommendation should feel like guidance, not a SKU picker.",
    dataObjective: "Resolve recommended CABN model from use case.",
    answerType: "custom",
    nextSceneId: "dream_style",
  },
  {
    id: "dream_style",
    order: 3,
    phase: "dream",
    title: "Choose architecture style",
    subtitle: "Set the feeling before property constraints enter.",
    emotionalObjective: "Let the customer personalize the dream.",
    philosophicalObjective: "Style is part of the sale, not decoration after the fact.",
    dataObjective: "Capture preferred design direction.",
    question: "Which style feels like yours?",
    answerType: "single_choice",
    nextSceneId: "dream_property_cta",
    options: [
      {
        id: "modern",
        label: "Modern",
        description: "Crisp lines, larger glass, charcoal accents.",
        metadata: { accentClass: "bg-[#d8e7ed]" },
      },
      {
        id: "warm-wood",
        label: "Warm wood",
        description: "Natural texture, softer light, grounded finishes.",
        metadata: { accentClass: "bg-[#e6d7bd]" },
      },
      {
        id: "minimal",
        label: "Minimal",
        description: "Quiet surfaces, hidden storage, gallery calm.",
        metadata: { accentClass: "bg-[#e8e8e2]" },
      },
      {
        id: "garden-studio",
        label: "Garden studio",
        description: "Green views, gentle privacy, landscape-first feel.",
        metadata: { accentClass: "bg-[#cfe1d3]" },
      },
      {
        id: "luxury-guest-suite",
        label: "Luxury guest suite",
        description: "Elevated finishes, hospitality comfort, richer detail.",
        metadata: { accentClass: "bg-[#d9d7e8]" },
      },
    ],
  },
  {
    id: "dream_property_cta",
    order: 4,
    phase: "dream",
    title: "See how this fits my property",
    subtitle: "Move from emotion into guided property adaptation.",
    emotionalObjective: "Preserve excitement while introducing logistics.",
    philosophicalObjective: "Constraints should adapt the dream, not kill it.",
    dataObjective: "Transition to address or lot selection.",
    answerType: "confirmation",
    nextSceneId: "property_entry",
  },
  {
    id: "property_entry",
    order: 5,
    phase: "make_it_yours",
    title: "Enter address or choose lot",
    emotionalObjective: "Make the dream feel real and specific.",
    philosophicalObjective: "Property intelligence starts only after desire is established.",
    dataObjective: "Collect address or selected land parcel.",
    answerType: "address",
    nextSceneId: "property_review",
  },
  {
    id: "property_review",
    order: 6,
    phase: "make_it_yours",
    title: "Review selected property / lot",
    emotionalObjective: "Reassure the user that Tonyville found the right place.",
    philosophicalObjective: "Show data honestly without pretending certainty.",
    dataObjective: "Confirm lot boundary, source, and known data gaps.",
    answerType: "confirmation",
    nextSceneId: "place_room",
  },
  {
    id: "place_room",
    order: 7,
    phase: "make_it_yours",
    title: "Place the room on the lot",
    emotionalObjective: "Let the customer feel ownership of the plan.",
    philosophicalObjective: "Placement is a guided preview, not a CAD promise.",
    dataObjective: "Capture room placement and validate hard conflicts.",
    answerType: "placement",
    nextSceneId: "edit_cabn",
  },
  {
    id: "edit_cabn",
    order: 8,
    phase: "make_it_yours",
    title: "Edit Your CABN",
    subtitle:
      "Now that we know where your CABN sits, choose how it should face the sun, views, privacy, and access.",
    emotionalObjective: "Turn placement into a personalized room plan.",
    philosophicalObjective: "The property should guide the CABN without making the experience feel technical.",
    dataObjective: "Capture window, door, desk, built-ins, and view wall orientation choices.",
    answerType: "custom",
    nextSceneId: "feasibility_result",
  },
  {
    id: "run_feasibility",
    order: 9,
    phase: "make_it_yours",
    title: "Run CABN Feasibility Engine v0.1",
    emotionalObjective: "Create confidence without overclaiming certainty.",
    philosophicalObjective: "The GUI earns confidence; the visit earns certainty.",
    dataObjective: "Evaluate reservation-screening rules.",
    answerType: "custom",
    nextSceneId: "feasibility_result",
  },
  {
    id: "feasibility_result",
    order: 10,
    phase: "make_it_yours",
    title: "Review CABN Plan",
    emotionalObjective: "Give a clear next step without technical fog.",
    philosophicalObjective: "Output should guide reservation acceptance, review, or rejection.",
    dataObjective: "Show customization choices and likely, needs review, or unlikely with rule evidence.",
    answerType: "confirmation",
    nextSceneId: "project_reservation",
  },
  {
    id: "project_reservation",
    order: 11,
    phase: "make_it_yours",
    title: "Project Reservation / Contact Tony",
    emotionalObjective: "Invite the customer into the next human step.",
    philosophicalObjective: "Reservations happen when confidence is earned, not certainty claimed.",
    dataObjective: "Capture lead intent or contact Tony.",
    answerType: "confirmation",
  },
];

export function getCabnScene(id: string) {
  return cabnScenes.find((scene) => scene.id === id);
}

export function getOrderedCabnScenes() {
  return [...cabnScenes].sort((a, b) => a.order - b.order);
}

export function getSceneOption(sceneId: string, optionId?: string | string[]) {
  const raw = Array.isArray(optionId) ? optionId[0] : optionId;
  const scene = getCabnScene(sceneId);
  return (
    scene?.options?.find((option) => option.id === raw) ?? scene?.options?.[0]
  );
}
