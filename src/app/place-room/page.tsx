import { PlaceRoomApp } from "@/components/PlaceRoomApp";
import { logMissingEnv } from "@/lib/env";

export default function PlaceRoomPage() {
  logMissingEnv("place-room", ["NEXT_PUBLIC_MAPBOX_TOKEN"]);

  return <PlaceRoomApp mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""} />;
}
