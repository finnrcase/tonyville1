import { mockParcels } from "@/lib/mockParcels";
import { distanceInMiles, tonyvilleFitScore } from "@/lib/tonyvilleFitScore";
import { getTinyHomeCompatibility } from "@/lib/tinyHomes";
import {
  buildCABNScoringInputFromParcel,
  cabnCompatibilityScore,
} from "@/lib/scoring/cabnCompatibilityScore";
import type {
  Parcel,
  PermitFriendlinessFilter,
  ScoredParcel,
  SearchCenter,
  SearchFilters,
  SortOption,
} from "@/types/parcel";

export const defaultSearchFilters: SearchFilters = {
  location: "Austin, TX",
  radiusMiles: 55,
  maxPrice: 140000,
  modelSize: 160,
  utilities: {
    water: false,
    electricity: false,
    sewerSeptic: false,
  },
  requiresRoadAccess: true,
  permitFriendliness: "any",
};

export const knownSearchCenters: SearchCenter[] = [
  { label: "Austin, TX", lat: 30.2672, lng: -97.7431 },
  { label: "Bastrop, TX", lat: 30.1105, lng: -97.3153 },
  { label: "Cedar Creek, TX", lat: 30.0874, lng: -97.5005 },
  { label: "Dripping Springs, TX", lat: 30.1902, lng: -98.0867 },
  { label: "Georgetown, TX", lat: 30.6333, lng: -97.6779 },
  { label: "Lago Vista, TX", lat: 30.4602, lng: -97.9883 },
  { label: "Lockhart, TX", lat: 29.8849, lng: -97.6692 },
  { label: "Marble Falls, TX", lat: 30.5782, lng: -98.2728 },
  { label: "San Marcos, TX", lat: 29.8833, lng: -97.9414 },
  { label: "Taylor, TX", lat: 30.5708, lng: -97.4095 },
  { label: "Wimberley, TX", lat: 30.0294, lng: -98.1182 },
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function resolveSearchCenter(location: string): SearchCenter {
  const normalized = normalize(location);

  return (
    knownSearchCenters.find((center) => {
      const centerName = normalize(center.label);
      const cityName = centerName.split(",")[0];
      return normalized.includes(cityName) || cityName.includes(normalized);
    }) ?? knownSearchCenters[0]
  );
}

function matchesPermitFilter(
  parcel: Parcel,
  permitFilter: PermitFriendlinessFilter,
) {
  if (permitFilter === "any") {
    return true;
  }

  if (permitFilter === "medium") {
    return parcel.permitFriendliness !== "challenging";
  }

  return parcel.permitFriendliness === "friendly";
}

function matchesUtilityFilters(parcel: Parcel, filters: SearchFilters) {
  return Object.entries(filters.utilities).every(([key, required]) => {
    if (!required) {
      return true;
    }

    return parcel.utilities[key as keyof SearchFilters["utilities"]];
  });
}

function matchesPriceFilter(parcel: Parcel, filters: SearchFilters) {
  if (!Number.isFinite(filters.maxPrice) || filters.maxPrice <= 0) {
    return true;
  }

  // Only a real listing/asking price should price a buyer out of a parcel. Assessed or
  // estimated land values (e.g. LA County GIS geometry parcels, which are a screening
  // fallback and not a listing feed) are not asking prices, so a budget must not exclude
  // them — otherwise high-assessed-value metros like LA show no lots.
  if (parcel.priceSource !== "listing") {
    return true;
  }

  if (!Number.isFinite(parcel.price) || parcel.price <= 0) {
    return true;
  }

  return parcel.price <= filters.maxPrice;
}

export function scoreAndFilterParcels(
  parcels: Parcel[],
  filters: SearchFilters,
  center = resolveSearchCenter(filters.location),
): ScoredParcel[] {
  return parcels
    .map((parcel) => {
      const distanceMiles = distanceInMiles(center, parcel);

      return {
        ...parcel,
        distanceMiles,
        fitScore: tonyvilleFitScore(parcel, filters, distanceMiles),
        compatibility: getTinyHomeCompatibility(parcel, filters),
        cabnCompatibility: cabnCompatibilityScore(
          buildCABNScoringInputFromParcel(parcel),
        ),
      };
    })
    .filter((parcel) => parcel.distanceMiles <= filters.radiusMiles)
    .filter((parcel) => matchesPriceFilter(parcel, filters))
    .filter((parcel) => matchesUtilityFilters(parcel, filters))
    .filter((parcel) =>
      filters.requiresRoadAccess ? parcel.roadAccess.available : true,
    )
    .filter((parcel) => matchesPermitFilter(parcel, filters.permitFriendliness))
    .sort((a, b) => b.fitScore.total - a.fitScore.total);
}

export function sortParcels(parcels: ScoredParcel[], sort: SortOption) {
  const score = (parcel: ScoredParcel) =>
    parcel.cabnCompatibility?.totalScore ?? parcel.fitScore.total;

  return [...parcels].sort((a, b) => {
    if (sort === "lowestPrice") {
      return a.price - b.price;
    }

    if (sort === "largestLot") {
      return b.acreage - a.acreage;
    }

    if (sort === "closest") {
      return a.distanceMiles - b.distanceMiles;
    }

    if (sort === "highestScore") {
      return score(b) - score(a);
    }

    return (
      score(b) +
      b.fitScore.breakdown.price * 0.08 -
      (score(a) + a.fitScore.breakdown.price * 0.08)
    );
  });
}

export function getMockParcelSearch(filters: SearchFilters) {
  const center = resolveSearchCenter(filters.location);

  return {
    center,
    parcels: scoreAndFilterParcels(mockParcels, filters, center),
  };
}
