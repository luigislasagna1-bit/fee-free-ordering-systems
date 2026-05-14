"use client";
import { useJsApiLoader, type Libraries } from "@react-google-maps/api";

// All Google-Maps-backed components in the app share one loader so the JS SDK
// downloads exactly once per page. Each page passes the restaurant's own key.
const LIBRARIES: Libraries = ["places"];

export function useGoogleMaps(apiKey: string) {
  return useJsApiLoader({
    id: "google-maps-script",
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });
}
