import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./supabase";

const TARIF = { base: 500, parKm: 250, parMin: 30, minimum: 700 };
const VITESSE_MOY = 22;
const NDJAMENA = [12.1348, 15.0557];

const CLASSES = [
  { mult: 1, nom: "Start", ic: "🛵" },
  { mult: 1.5, nom: "Eco", ic: "🚗" },
  { mult: 2.2, nom: "Confort", ic: "🚙" },
];
const PAIEMENTS = [
  { id: "airtel", nom: "Airtel Money", ic: "📱" },
  { id: "moov", nom: "Moov Money", ic: "📲" },
  { id: "cash", nom: "Espèces", ic: "💵" },
];

function distanceKm(a, b) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function arrondir(p) { return Math.round(p / 50) * 50; }

function icone(couleur) {
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 36 48"><path d="M18 0C8 0 0 8 0 18c0 13 18 30 18 30s18-17 18-30C36 8 28 0 18 0z" fill="${couleur}"/><circle cx="18" cy="18" r="6" fill="#fff"/></svg>`,
    iconSize: [30, 40], iconAnchor: [15, 40],
  });
}
function iconeVoiture() {
  return L.divIcon({
    className: "",
    html: `<div style="background:#16a34a;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:16px;">🚗</div>`,
    iconSize: [30, 30], iconAnchor: [15, 15],
  });
}

// Capture les clics sur la carte
function GestionClic({ onClic }) {
  useMapEvents({ click: (e) => onClic(e.latlng.lat, e.latlng.lng) });
  return null;
}
// Ajuste la vue
function AjusterVue({ points }) {
  const map = useMap();
  useEffect(() => {
    const valides = points.filter(Boolean);
    if (valides.length >= 2) map.fitBounds(valides, { padding: [60, 60] });
  }, [points, map]);
  return null;
}

export default function Passager() {
  const [champActif, setChampActif] = useState("depart");
  const [depart, setDepart] = useState(null);
  const [dest, setDest] = useState(null);
  const [classe, setClasse] = useState(1);
  const [classeNom, setClasseNom] = useState("Start");
  const [paiement, setPaiement] = useState("airtel");
  const [calcul, setCalcul] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [courseId, setCourseId] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [posChauffeur, setPosChauffeur] = useState(null);

  function poserPoint(lat, lng) {
    if (confirm) return; // on ne change plus une fois commandé
    if (champActif === "depart") {
      setDepart([lat, lng]);
      if (!dest) setChampActif("dest");
    } else {
      setDest([lat, lng]);
    }
  }

  useEffect(() => {
    if (!depart || !dest) return;
    const km = distanceKm(depart, dest) * 1.35;
    const min = (km / VITESSE_MOY) * 60;
    let prixBase = TARIF.base + km * TARIF.parKm + min * TARIF.parMin;
    prixBase = Math.max(prixBase, TARIF.minimum);
    setCalcul({ km, min, prixBase });
  }, [depart, dest]);

  const prixActuel = calcul ? arrondir(calcul.prixBase * classe) : null;

  async function commander() {
    if (!calcul) return;
    setErreur(null);
    const nouvelleCourse = {
      depart_lat: depart[0], depart_lng: depart[1],
      dest_lat: dest[0], dest_lng: dest[1],
      classe: classeNom, prix_fcfa: prixActuel,
      distance_km: parseFloat(calcul.km.toFixed(1)),
      duree_min: Math.round(calcul.min),
      mode_paiement: paiement, statut: "recherche",
    };
    const { data, error } = await supabase.from("courses").insert(nouvelleCourse).select().single();
    if (error) { setErreur(error.message); return; }
    setCourseId(data.id);
    setConfirm({ prix: prixActuel, payNom: PAIEMENTS.find((p) => p.id === paiement).nom });
  }

  // Écouter le statut + la position du chauffeur en temps réel
  useEffect(() => {
    if (!courseId) return;
    const canal = supabase
      .channel("course-" + courseId)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "courses", filter: "id=eq." + courseId },
        (payload) => {
          const c = payload.new;
          if (c.chauffeur_nom) {
            setConfirm((prev) => ({
              ...prev,
              chauffeur: { nom: c.chauffeur_nom, plate: c.chauffeur_plaque, car: c.chauffeur_vehicule },
            }));
          }
          if (c.chauffeur_lat && c.chauffeur_lng) {
            setPosChauffeur([c.chauffeur_lat, c.chauffeur_lng]);
          }
        }
      ).subscribe();
    return () => supabase.removeChannel(canal);
  }, [courseId]);

  function fermerConfirm() { setConfirm(null); setCourseId(null); setPosChauffeur(null); }

  return (
    <div id="app">
      <div id="header">
        <div id="logo-badge"></div>
        <h1>NDjam<span> Ride</span><small>Votre course à N'Djamena</small></h1>
      </div>

      <div id="map">
        <MapContainer center={NDJAMENA} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <GestionClic onClic={poserPoint} />
          {depart && <Marker position={depart} icon={icone("#002664")} />}
          {dest && <Marker position={dest} icon={icone("#C60C30")} />}
          {depart && dest && <Polyline positions={[depart, dest]} pathOptions={{ color: "#FECB00", weight: 4, dashArray: "2,8" }} />}
          {posChauffeur && <Marker position={posChauffeur} icon={iconeVoiture()} />}
          <AjusterVue points={[posChauffeur, depart, dest]} />
        </MapContainer>
      </div>

      {!confirm && (!depart || !dest) && (
        <div id="hint">
          {champActif === "depart" ? "📍 Tapez sur la carte pour le départ" : "🏁 Tapez sur la carte pour la destination"}
        </div>
      )}

      {!confirm && (
        <div id="panel">
          <div id="panel-grip"></div>
          <div className={"field" + (champActif === "depart" ? " active" : "")} onClick={() => setChampActif("depart")}>
            <div className="dot depart"></div>
            <div>
              <div className="label">Départ</div>
              <div className={"value" + (depart ? "" : " empty")}>
                {depart ? `${depart[0].toFixed(4)}, ${depart[1].toFixed(4)}` : "Pointez votre position"}
              </div>
            </div>
          </div>
          <div className={"field" + (champActif === "dest" ? " active" : "")} onClick={() => setChampActif("dest")}>
            <div className="dot dest"></div>
            <div>
              <div className="label">Destination</div>
              <div className={"value" + (dest ? "" : " empty")}>
                {dest ? `${dest[0].toFixed(4)}, ${dest[1].toFixed(4)}` : "Où allez-vous ?"}
              </div>
            </div>
          </div>

          {calcul && (
            <div id="estimate" className="show">
              <div className="row">
                <div id="est-price">{prixActuel.toLocaleString("fr-FR")} <small>FCFA</small></div>
                <div id="est-meta">📏 {calcul.km.toFixed(1)} km<br />⏱ ~{Math.round(calcul.min)} min</div>
              </div>
              <div id="classes">
                {CLASSES.map((c) => (
                  <div key={c.nom} className={"class-card" + (classe === c.mult ? " sel" : "")}
                    onClick={() => { setClasse(c.mult); setClasseNom(c.nom); }}>
                    <div className="ic">{c.ic}</div>
                    <div className="nm">{c.nom}</div>
                    <div className="pr">{arrondir(calcul.prixBase * c.mult).toLocaleString("fr-FR")} F</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div id="pay">
            {PAIEMENTS.map((p) => (
              <div key={p.id} className={"pay-opt" + (paiement === p.id ? " sel" : "")} onClick={() => setPaiement(p.id)}>
                <span className="ic">{p.ic}</span>{p.nom}
              </div>
            ))}
          </div>

          {erreur && <div style={{ color: "#C60C30", fontSize: "12px", marginBottom: "8px", textAlign: "center" }}>Erreur : {erreur}</div>}

          <button id="order-btn" disabled={!calcul} onClick={commander}>
            {calcul ? "Commander maintenant" : "Choisissez un trajet"}
          </button>
        </div>
      )}

      {confirm && (
        <div id="panel">
          <div id="panel-grip"></div>
          {!confirm.chauffeur ? (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div className="check" style={{ background: "#FECB00", color: "#002664" }}>&#9203;</div>
              <h2 style={{ color: "#0d1117", margin: "10px 0 6px" }}>Recherche en cours...</h2>
              <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "12px" }}>En attente d'un chauffeur.</p>
              <div className="car-info" style={{ justifyContent: "center" }}>
                <div>
                  <div className="driver-nm">Trajet {classeNom} · {confirm.prix.toLocaleString("fr-FR")} FCFA</div>
                  <div className="driver-meta">Paiement : {confirm.payNom}</div>
                </div>
              </div>
              <button id="close-confirm" onClick={fermerConfirm}>Annuler la demande</button>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <h2 style={{ color: "#16a34a", margin: "0 0 8px" }}>✓ Chauffeur en route !</h2>
              <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "10px" }}>
                {posChauffeur ? "Suivez sa position sur la carte" : "Votre chauffeur arrive bientôt"}
              </p>
              <div className="car-info">
                <div className="plate">{confirm.chauffeur.plate}</div>
                <div>
                  <div className="driver-nm">{confirm.chauffeur.nom}</div>
                  <div className="driver-meta">{confirm.chauffeur.car}</div>
                </div>
              </div>
              <p style={{ color: "#6b7280", fontSize: "13px", margin: "8px 0" }}>
                Trajet {classeNom} · <b>{confirm.prix.toLocaleString("fr-FR")} FCFA</b> · {confirm.payNom}
              </p>
              <button id="close-confirm" onClick={fermerConfirm}>Terminer</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
