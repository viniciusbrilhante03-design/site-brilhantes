let promise = null;

export function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (promise) return promise;
  const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  promise = new Promise((resolve, reject) => {
    if (!key) { reject(new Error("missing key")); return; }
    const existing = document.getElementById("gmaps-script");
    if (existing) { existing.addEventListener("load", () => resolve(window.google.maps)); return; }
    const s = document.createElement("script");
    s.id = "gmaps-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google.maps);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return promise;
}
