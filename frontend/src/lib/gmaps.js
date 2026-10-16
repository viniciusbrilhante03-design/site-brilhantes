let promise = null;

export function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (promise) return promise;
  const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  promise = new Promise((resolve, reject) => {
    if (!key) { reject(new Error("missing key")); return; }
    const done = () => {
      if (window.google?.maps?.Map) resolve(window.google.maps);
      else reject(new Error("maps not ready"));
    };
    const existing = document.getElementById("gmaps-script");
    if (existing) { existing.addEventListener("load", done); return; }
    const s = document.createElement("script");
    s.id = "gmaps-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly`;
    s.async = true;
    s.defer = true;
    s.onload = done;
    s.onerror = () => reject(new Error("script error"));
    document.head.appendChild(s);
  });
  return promise;
}
