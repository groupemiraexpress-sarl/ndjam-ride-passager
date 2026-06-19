import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./supabase";
import "./App.css";

const NDJAMENA = [12.1348, 15.0557];
const VITESSE_MOY = 22;
const URL_CHAUFFEUR = "https://ndjam-ride-chauffeur.vercel.app";

const CATEGORIES = [
  { id: "moto",        nom: "Moto",     ic: "🛵", prixKm: 400,  minimum: 500 },
  { id: "eco",         nom: "Éco",      ic: "🚗", prixKm: 550,  minimum: 700 },
  { id: "confort",     nom: "Confort",  ic: "🚙", prixKm: 700,  minimum: 900 },
  { id: "confortplus", nom: "Confort+", ic: "🚘", prixKm: 1400, minimum: 1500 },
];

// Bannières en mode story multi-pages.
const BANNIERES = [
  {
    vignette: "/story1-1.png",
    type: "chauffeur",
    pages: [
      { img: "/story1-1.png", titre: "Devenez chauffeur Mira Express",
        texte: "Roulez à votre rythme et gagnez un revenu avec Mira Express." },
      { img: "/story1-2.png", titre: "Vos avantages",
        texte: "Travaillez quand vous voulez, recevez des courses chaque jour et soyez payé pour vos trajets." },
      { img: "/story1-3.png", titre: "Rejoignez-nous",
        texte: "Inscrivez-vous en quelques minutes. Votre identité est vérifiée pour la sécurité de tous." },
    ],
  },
  {
    vignette: "/story2-1.png",
    type: "info",
    pages: [
      { img: "/story2-1.png", titre: "Voyagez en toute sécurité",
        texte: "Votre sécurité est notre priorité à chaque trajet." },
      { img: "/story2-2.png", titre: "Chauffeurs vérifiés",
        texte: "Chaque chauffeur fournit une pièce d'identité et une photo, vérifiées avant son activation." },
      { img: "/story2-3.png", titre: "Course protégée",
        texte: "Un code à 4 chiffres démarre la course, et votre trajet est suivi par GPS en temps réel." },
    ],
  },
  {
    vignette: "/story3-1.png",
    type: "info",
    pages: [
      { img: "/story3-1.png", titre: "Comment ça marche ?",
        texte: "Commander une course est simple et rapide." },
      { img: "/story3-2.png", titre: "1. Choisissez",
        texte: "Indiquez votre destination directement sur la carte." },
      { img: "/story3-3.png", titre: "2. Commandez et voyagez",
        texte: "Obtenez le prix à l'avance, puis voyagez avec un chauffeur vérifié." },
    ],
  },
  {
    vignette: "/story4-1.png",
    type: "info",
    pages: [
      { img: "/story4-1.png", titre: "Mira Express évolue",
        texte: "Mira Express, ce n'est pas que le transport de personnes." },
      { img: "/story4-2.png", titre: "Bientôt : livraison de colis",
        texte: "Faites livrer vos colis partout en ville, rapidement et en toute sécurité." },
      { img: "/story4-3.png", titre: "Plus de services",
        texte: "Mira Express grandit pour vous simplifier la vie au quotidien." },
    ],
  },
];

const PAIEMENTS = [
  { id: "airtel", nom: "Airtel Money", ic: "📱" },
  { id: "moov", nom: "Moov Money", ic: "📲" },
  { id: "cash", nom: "Espèces", ic: "💵" },
];
const MOTIFS = [
  "Le chauffeur met trop de temps",
  "J'ai changé d'avis",
  "Erreur d'adresse",
  "J'ai trouvé un autre moyen",
  "Autre",
];
const TAGS_NOTE = [
  { id: "poli", nom: "Conducteur poli", ic: "🙂" },
  { id: "conduite", nom: "Conduite agréable", ic: "👍" },
  { id: "interieur", nom: "Intérieur propre", ic: "✨" },
  { id: "discussion", nom: "Discussion agréable", ic: "💬" },
  { id: "musique", nom: "Musique agréable", ic: "🎵" },
];

const POSITIONS = { plein: 0, moyen: 45, petit: 72 };
const SUPPLEMENT_POINTE = 1.2;

// Lieux populaires de N'Djamena affichés sur l'accueil (comme Yango).
// minIndicatif = temps estimé fixe (non calculé en direct).
const LIEUX_POPULAIRES = [
  { nom: "Aéroport de N'Djamena", quartier: "Hassan Djamous", ic: "✈️", lat: 12.1337, lng: 15.0340, minIndicatif: 14 },
  { nom: "Grand Marché", quartier: "Centre-ville", ic: "🛍️", lat: 12.1095, lng: 15.0444, minIndicatif: 8 },
  { nom: "Université de N'Djamena", quartier: "Toukra", ic: "🎓", lat: 12.0670, lng: 15.0490, minIndicatif: 18 },
  { nom: "Hôpital Général", quartier: "Référence Nationale", ic: "🏥", lat: 12.1108, lng: 15.0511, minIndicatif: 10 },
  { nom: "Marché de Dembé", quartier: "Dembé", ic: "🛒", lat: 12.0920, lng: 15.0680, minIndicatif: 12 },
];

function estHeurePointe() {
  const h = new Date().getHours();
  return (h >= 7 && h < 9) || (h >= 17 && h < 19);
}

function distanceKm(a, b) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Calcule le vrai trajet par les routes via OSRM (gratuit, OpenStreetMap).
// Renvoie { points: [[lat,lng],...], distanceKm: nombre } ou null si échec.
async function calculerRoute(depart, dest) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${depart[1]},${depart[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
    const rep = await fetch(url);
    if (!rep.ok) return null;
    const data = await rep.json();
    if (!data.routes || data.routes.length === 0) return null;
    const route = data.routes[0];
    const points = route.geometry.coordinates.map((c) => [c[1], c[0]]);
    const distance = route.distance / 1000;
    return { points, distanceKm: distance };
  } catch (e) {
    return null;
  }
}

function arrondir(p) { return Math.round(p / 50) * 50; }

function prixCategorie(cat, km, pointe) {
  let p = Math.max(cat.prixKm * km, cat.minimum);
  if (pointe) p = p * SUPPLEMENT_POINTE;
  return arrondir(p);
}

function icone(couleur) {
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 36 48"><path d="M18 0C8 0 0 8 0 18c0 13 18 30 18 30s18-17 18-30C36 8 28 0 18 0z" fill="${couleur}"/><circle cx="18" cy="18" r="6" fill="#fff"/></svg>`,
    iconSize: [30, 40], iconAnchor: [15, 40],
  });
}
// Convertit un nom de couleur (texte libre du chauffeur) en code couleur.
function couleurVers(nomCouleur) {
  if (!nomCouleur) return "#002664";
  const c = nomCouleur.toLowerCase().trim();
  const table = {
    "noir": "#1a1a1a", "noire": "#1a1a1a", "black": "#1a1a1a",
    "blanc": "#e8e8e8", "blanche": "#e8e8e8", "white": "#e8e8e8",
    "gris": "#7a7a7a", "grise": "#7a7a7a", "gray": "#7a7a7a", "grey": "#7a7a7a", "argent": "#b0b0b0", "argenté": "#b0b0b0",
    "rouge": "#c0392b", "red": "#c0392b",
    "bleu": "#2563eb", "bleue": "#2563eb", "blue": "#2563eb",
    "vert": "#16a34a", "verte": "#16a34a", "green": "#16a34a",
    "jaune": "#eab308", "yellow": "#eab308",
    "orange": "#ea580c",
    "marron": "#92400e", "brun": "#92400e", "brown": "#92400e",
    "beige": "#d6c9a8",
    "violet": "#7c3aed", "mauve": "#7c3aed",
    "or": "#d4af37", "doré": "#d4af37", "dorée": "#d4af37",
  };
  for (const mot in table) {
    if (c.includes(mot)) return table[mot];
  }
  return "#002664"; // bleu Mira par défaut
}

function iconeVoiture(couleur) {
  const fill = couleur || "#002664";
  // Pare-brises : clairs si voiture foncée, foncés si voiture claire
  const vitres = "#9fc0e8";
  return L.divIcon({
    className: "",
    html: `<svg width="34" height="34" viewBox="0 0 48 48">
      <rect x="14" y="6" width="20" height="36" rx="7" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
      <rect x="16" y="13" width="16" height="9" rx="3" fill="${vitres}"/>
      <rect x="16" y="27" width="16" height="8" rx="3" fill="${vitres}"/>
      <rect x="17" y="23" width="14" height="4" rx="2" fill="#FECB00"/>
      <circle cx="19" cy="9" r="1.4" fill="#fff7cc"/>
      <circle cx="29" cy="9" r="1.4" fill="#fff7cc"/>
    </svg>`,
    iconSize: [34, 34], iconAnchor: [17, 17],
  });
}

function GestionClic({ onClic }) {
  useMapEvents({ click: (e) => onClic(e.latlng.lat, e.latlng.lng) });
  return null;
}
function AjusterVue({ points }) {
  const map = useMap();
  const dernierNombre = useRef(0);
  useEffect(() => {
    const valides = points.filter(Boolean);
    // On ne recadre QUE si le nombre de points a changé (nouveau point posé/livreur arrivé),
    // pas à chaque mise à jour GPS. Ainsi l'utilisateur garde son zoom librement.
    if (valides.length >= 2 && valides.length !== dernierNombre.current) {
      map.fitBounds(valides, { padding: [60, 60] });
      dernierNombre.current = valides.length;
    } else if (valides.length < 2) {
      dernierNombre.current = valides.length;
    }
  }, [points, map]);
  return null;
}

/* ===================== ÉCRAN D'ACCUEIL / AUTH ===================== */
function Accueil() {
  const [mode, setMode] = useState("connexion");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);

  function traduireErreur(msg) {
    if (msg.includes("Invalid login")) return "Email ou mot de passe incorrect.";
    if (msg.includes("already registered")) return "Cet email a déjà un compte. Connectez-vous.";
    if (msg.includes("at least 6")) return "Le mot de passe doit faire au moins 6 caractères.";
    return msg;
  }
  async function soumettre() {
    setErreur(null); setInfo(null);
    if (!email.trim() || !mdp.trim()) { setErreur("Email et mot de passe requis."); return; }
    setChargement(true);
    if (mode === "connexion") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: mdp });
      if (error) setErreur(traduireErreur(error.message));
    } else {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password: mdp });
      if (error) setErreur(traduireErreur(error.message));
      else setInfo("Compte créé ! Connexion en cours...");
    }
    setChargement(false);
  }

  return (
    <div className="accueil">
      <div className="accueil-logo">
        <div id="logo-badge" style={{ width: 60, height: 60, borderRadius: 16 }}></div>
        <h1>Mira<span>Express</span></h1>
        <p>Votre trajet, notre priorité</p>
      </div>
      <div className="accueil-carte">
        <div className="accueil-tabs">
          <button className={mode === "connexion" ? "tab-actif" : ""}
            onClick={() => { setMode("connexion"); setErreur(null); setInfo(null); }}>Se connecter</button>
          <button className={mode === "inscription" ? "tab-actif" : ""}
            onClick={() => { setMode("inscription"); setErreur(null); setInfo(null); }}>Créer un compte</button>
        </div>
        <input type="email" placeholder="Adresse email" value={email}
          onChange={(e) => setEmail(e.target.value)} className="accueil-input" />
        <input type="password" placeholder="Mot de passe" value={mdp}
          onChange={(e) => setMdp(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") soumettre(); }} className="accueil-input" />
        {erreur && <div className="accueil-erreur">{erreur}</div>}
        {info && <div className="accueil-info">{info}</div>}
        <button className="accueil-btn" onClick={soumettre} disabled={chargement}>
          {chargement ? "Patientez..." : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
        </button>
        <p className="accueil-bascule">
          {mode === "connexion" ? (
            <>Pas encore de compte ? <span onClick={() => { setMode("inscription"); setErreur(null); }}>Inscrivez-vous</span></>
          ) : (
            <>Déjà un compte ? <span onClick={() => { setMode("connexion"); setErreur(null); }}>Connectez-vous</span></>
          )}
        </p>
      </div>
    </div>
  );
}

/* ===================== ÉCRAN DE CHOIX (Me déplacer / Colis) ===================== */
function EcranChoix({ onChoix, onDeconnexion }) {
  return (
    <div className="choix-wrap">
      <div className="choix-header">
        <div id="logo-badge" style={{ width: 48, height: 48, borderRadius: 13 }}></div>
        <h1>Mira<span>Express</span></h1>
        <button onClick={onDeconnexion} className="choix-deco">Déconnexion</button>
      </div>
      <div className="choix-contenu">
        <h2 className="choix-titre">Que souhaitez-vous faire ?</h2>
        <p className="choix-sous">Choisissez le type de service</p>

        <div className="choix-carte" onClick={() => onChoix("course")}>
          <div className="choix-ic">🧍</div>
          <div>
            <div className="choix-nom">Me déplacer</div>
            <div className="choix-desc">Commander une course pour vous déplacer en ville</div>
          </div>
          <div className="choix-fleche">›</div>
        </div>

        <div className="choix-carte" onClick={() => onChoix("colis")}>
          <div className="choix-ic">📦</div>
          <div>
            <div className="choix-nom">Envoyer un colis</div>
            <div className="choix-desc">Faire livrer un colis d'un point à un autre</div>
          </div>
          <div className="choix-fleche">›</div>
        </div>
      </div>
    </div>
  );
}

/* ===================== ÉCRAN COLIS (bientôt disponible) ===================== */
const TAILLES_COLIS = [
  { id: "petit", nom: "Petit", desc: "Document, téléphone (< 5 kg)", ic: "📄", base: 500 },
  { id: "moyen", nom: "Moyen", desc: "Carton, sac (5-15 kg)", ic: "📦", base: 1000 },
  { id: "grand", nom: "Grand", desc: "Valise, gros colis (15-30 kg)", ic: "🧳", base: 2000 },
];
const PRIX_KM_COLIS = 300;

function EcranColis({ onRetour, session }) {
  const [etape, setEtape] = useState(1);
  const [mode, setMode] = useState("porte");
  const [champActif, setChampActif] = useState("ramassage");
  const [ramassage, setRamassage] = useState(null);
  const [livraison, setLivraison] = useState(null);
  const [nomRamassage, setNomRamassage] = useState(null);
  const [nomLivraison, setNomLivraison] = useState(null);
  const [routePoints, setRoutePoints] = useState(null);
  const [distance, setDistance] = useState(null);
  const [taille, setTaille] = useState("petit");
  const [description, setDescription] = useState("");
  const [destNom, setDestNom] = useState("");
  const [destTel, setDestTel] = useState("");
  const [paiement, setPaiement] = useState("airtel");
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [confirme, setConfirme] = useState(null);
  const [colisId, setColisId] = useState(null);
  const [colisSuivi, setColisSuivi] = useState(null);
  const colisSuiviRef = useRef(null);
  const [livreurAnnule, setLivreurAnnule] = useState(false);
  const [posLivreur, setPosLivreur] = useState(null);
  const [routeSuivi, setRouteSuivi] = useState(null);

  async function nomDuLieu(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=fr`;
      const rep = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!rep.ok) return null;
      const data = await rep.json();
      const a = data.address || {};
      return a.road || a.neighbourhood || a.suburb || a.quarter || a.city_district || a.village || a.town || a.city || (data.display_name || "").split(",")[0] || null;
    } catch (e) { return null; }
  }

  function poserPoint(lat, lng) {
    if (champActif === "ramassage") {
      setRamassage([lat, lng]);
      setNomRamassage("…");
      nomDuLieu(lat, lng).then((n) => setNomRamassage(n));
      if (!livraison) setChampActif("livraison");
    } else {
      setLivraison([lat, lng]);
      setNomLivraison("…");
      nomDuLieu(lat, lng).then((n) => setNomLivraison(n));
    }
  }

  useEffect(() => {
    if (!ramassage || !livraison) { setRoutePoints(null); setDistance(null); return; }
    let annule = false;
    const dVol = distanceKm(ramassage, livraison) * 1.35;
    setDistance(dVol);
    calculerRoute(ramassage, livraison).then((res) => {
      if (annule || !res) return;
      setRoutePoints(res.points);
      setDistance(res.distanceKm);
    });
    return () => { annule = true; };
  }, [ramassage, livraison]);

  const tailleChoisie = TAILLES_COLIS.find((t) => t.id === taille);
  const prix = distance != null ? Math.round((tailleChoisie.base + distance * PRIX_KM_COLIS) / 50) * 50 : null;

  async function commander() {
    setErreur(null);
    if (!ramassage || !livraison) { setErreur("Indiquez le ramassage et la livraison."); return; }
    if (!destNom.trim() || !destTel.trim()) { setErreur("Renseignez le destinataire."); return; }
    setEnvoi(true);
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const { data, error } = await supabase.from("colis").insert({
      client_id: session?.user?.id || null,
      mode_livraison: mode,
      ramassage_lat: ramassage[0], ramassage_lng: ramassage[1], ramassage_nom: nomRamassage,
      livraison_lat: livraison[0], livraison_lng: livraison[1], livraison_nom: nomLivraison,
      taille, description: description.trim(),
      destinataire_nom: destNom.trim(), destinataire_tel: destTel.trim(),
      distance_km: distance != null ? parseFloat(distance.toFixed(1)) : null,
      prix_fcfa: prix, mode_paiement: paiement, statut: "recherche",
      code_retrait: code,
    }).select().single();
    setEnvoi(false);
    if (error) { setErreur(error.message); return; }
    setColisId(data.id);
    colisSuiviRef.current = data;
    setColisSuivi(data);
    setConfirme({ code, destNom: destNom.trim(), destTel: destTel.trim(), prix, ramassage: nomRamassage, livraison: nomLivraison });
  }

  // Suivi du colis en temps réel
  useEffect(() => {
    if (!colisId) return;
    const canal = supabase
      .channel("colis-" + colisId)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "colis", filter: "id=eq." + colisId },
        (payload) => {
          const c = payload.new;
          const avant = colisSuiviRef.current;
          // Le chauffeur a annulé : il y avait un livreur, et le colis repart en recherche sans livreur
          if (avant && avant.chauffeur_nom && c.statut === "recherche" && !c.chauffeur_nom) {
            setLivreurAnnule(true);
            setPosLivreur(null);
            setRouteSuivi(null);
            setTimeout(() => setLivreurAnnule(false), 8000);
          }
          colisSuiviRef.current = c;
          setColisSuivi(c);
          if (c.chauffeur_lat && c.chauffeur_lng) setPosLivreur([c.chauffeur_lat, c.chauffeur_lng]);
        }
      ).subscribe();
    return () => supabase.removeChannel(canal);
  }, [colisId]);

  // Trajet du livreur vers le ramassage (avant récupération) ou ramassage->livraison
  useEffect(() => {
    if (!colisSuivi || !posLivreur) { setRouteSuivi(null); return; }
    const ram = [colisSuivi.ramassage_lat, colisSuivi.ramassage_lng];
    const liv = [colisSuivi.livraison_lat, colisSuivi.livraison_lng];
    const recupere = colisSuivi.recupere;
    const a = recupere ? ram : posLivreur;
    const b = recupere ? liv : ram;
    let annule = false;
    calculerRoute(a, b).then((res) => { if (!annule && res) setRouteSuivi(res.points); });
    return () => { annule = true; };
  }, [colisSuivi, posLivreur]);

  async function annulerColisPassager() {
    if (!colisId) return;
    await supabase.from("colis").update({ statut: "annulee" }).eq("id", colisId);
    // Libérer le chauffeur s'il en avait un
    if (colisSuivi && colisSuivi.chauffeur_nom) {
      await supabase.from("chauffeurs").update({ en_course: false }).eq("nom", colisSuivi.chauffeur_nom);
    }
    onRetour();
  }

  if (confirme) {
    const s = colisSuivi || {};
    const statut = s.statut || "recherche";
    const ram = s.ramassage_lat ? [s.ramassage_lat, s.ramassage_lng] : null;
    const liv = s.livraison_lat ? [s.livraison_lat, s.livraison_lng] : null;
    const aLivreur = !!s.chauffeur_nom;
    const estLivre = statut === "livre";

    // Étapes du suivi
    const etapes = [
      { cle: "recherche", label: "Recherche d'un livreur", ic: "🔍" },
      { cle: "accepte", label: "Livreur en route vers le colis", ic: "🚗" },
      { cle: "recupere", label: "Colis récupéré, en livraison", ic: "📦" },
      { cle: "livre", label: "Colis livré", ic: "✅" },
    ];
    let etapeActuelle = 0;
    if (estLivre) etapeActuelle = 3;
    else if (s.recupere) etapeActuelle = 2;
    else if (aLivreur) etapeActuelle = 1;
    else etapeActuelle = 0;

    return (
      <div id="app">
        <div id="header">
          <div id="logo-badge"></div>
          <h1>Mira<span> Express</span><small>Suivi de votre colis</small></h1>
        </div>

        <div id="map">
          <MapContainer center={ram || NDJAMENA} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            {ram && <Marker position={ram} icon={icone("#002664")} />}
            {liv && <Marker position={liv} icon={icone("#C60C30")} />}
            {posLivreur && <Marker position={posLivreur} icon={iconeVoiture()} />}
            {routeSuivi && (
              <>
                <Polyline positions={routeSuivi} pathOptions={{ color: "#fff", weight: 9, opacity: 0.9 }} />
                <Polyline positions={routeSuivi} pathOptions={{ color: "#16a34a", weight: 5 }} />
              </>
            )}
            <AjusterVue points={[posLivreur, ram, liv]} />
          </MapContainer>
        </div>

        <div id="panel" className="glissable" style={{ transform: "translateY(0vh)", maxHeight: "64vh", overflowY: "auto" }}>
          <div className="panel-contenu">
            {livreurAnnule && (
              <div style={{ background: "#fef2f2", border: "1.5px solid #C60C30", borderRadius: "12px", padding: "12px", marginBottom: "12px", textAlign: "center", color: "#C60C30", fontWeight: 600, fontSize: "13px" }}>
                ⚠️ Le livreur a annulé. Nous recherchons un nouveau livreur pour votre colis...
              </div>
            )}
            {estLivre ? (
              <div style={{ textAlign: "center", marginBottom: "12px" }}>
                <div style={{ fontSize: "44px" }}>✅</div>
                <h2 style={{ color: "#16a34a", margin: "6px 0" }}>Colis livré !</h2>
                <p style={{ color: "#6b7280", fontSize: "13px" }}>Votre colis a bien été remis au destinataire.</p>
              </div>
            ) : (
              <>
                <h2 style={{ color: "#0d1117", marginBottom: "4px", textAlign: "center" }}>📦 Suivi du colis</h2>
                <p style={{ color: aLivreur ? "#16a34a" : "#a16207", fontSize: "13px", fontWeight: 700, textAlign: "center", marginBottom: "14px" }}>
                  {etapes[etapeActuelle].ic} {etapes[etapeActuelle].label}
                </p>
              </>
            )}

            {/* Frise des étapes */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {etapes.map((e, i) => (
                <div key={e.cle} style={{ display: "flex", alignItems: "center", gap: "10px", opacity: i <= etapeActuelle ? 1 : 0.4 }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: i <= etapeActuelle ? "#16a34a" : "#e5e7eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>
                    {i < etapeActuelle ? "✓" : e.ic}
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: i === etapeActuelle ? 700 : 500, color: "#0d1117" }}>{e.label}</div>
                </div>
              ))}
            </div>

            {/* Infos livreur quand il a accepté */}
            {aLivreur && !estLivre && (
              <div style={{ background: "#f3f4f6", borderRadius: "14px", padding: "14px", marginBottom: "14px" }}>
                <div style={{ fontWeight: 700, color: "#0d1117", marginBottom: "6px" }}>Votre livreur</div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {s.chauffeur_plaque && <div className="plate">{s.chauffeur_plaque}</div>}
                  <div>
                    <div style={{ fontWeight: 700 }}>{s.chauffeur_nom}</div>
                  </div>
                </div>
                {s.chauffeur_tel && (
                  <a href={"tel:" + s.chauffeur_tel}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "11px", marginTop: "10px", borderRadius: "11px", background: "#16a34a", color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: "15px" }}>
                    📞 Appeler le livreur
                  </a>
                )}
              </div>
            )}

            {/* Code de retrait + envoi (tant que pas livré) */}
            {!estLivre && (
              <div style={{ background: "#002664", borderRadius: "14px", padding: "14px", marginBottom: "14px" }}>
                <div style={{ color: "#fff", fontSize: "12px", marginBottom: "8px", textAlign: "center" }}>
                  Code de retrait à communiquer au destinataire
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "12px" }}>
                  {confirme.code.split("").map((c, i) => (
                    <div key={i} style={{ background: "#fff", color: "#002664", fontSize: "22px", fontWeight: 800, width: "40px", height: "50px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>{c}</div>
                  ))}
                </div>
                {(() => {
                  const msg = `Bonjour ${confirme.destNom}, un colis Mira Express vous est destiné. Votre code de retrait est : ${confirme.code}. Communiquez-le au livreur à la réception du colis.`;
                  const telPropre = (confirme.destTel || "").replace(/[^0-9]/g, "");
                  return (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <a href={`https://wa.me/${telPropre}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"
                        style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: "10px", background: "#25D366", color: "#fff", fontWeight: 700, textDecoration: "none", fontSize: "13px" }}>
                        💬 WhatsApp
                      </a>
                      <a href={`sms:${confirme.destTel}?body=${encodeURIComponent(msg)}`}
                        style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: "10px", background: "#fff", color: "#002664", fontWeight: 700, textDecoration: "none", fontSize: "13px" }}>
                        ✉️ SMS
                      </a>
                    </div>
                  );
                })()}
              </div>
            )}

            <button onClick={onRetour} style={{ width: "100%", border: "none", borderRadius: "11px", background: estLivre ? "#002664" : "#e5e7eb", color: estLivre ? "#fff" : "#6b7280", fontWeight: 700, padding: "13px", cursor: "pointer", fontSize: "15px" }}>
              {estLivre ? "Terminer" : "Retour à l'accueil"}
            </button>

            {!estLivre && (
              <button onClick={annulerColisPassager}
                style={{ width: "100%", border: "1.5px solid #C60C30", borderRadius: "11px", background: "#fff", color: "#C60C30", fontWeight: 700, padding: "12px", cursor: "pointer", fontSize: "14px", marginTop: "8px" }}>
                Annuler le colis
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="app">
      <div id="header">
        <div id="logo-badge"></div>
        <h1>Mira<span> Express</span><small>Envoi de colis</small></h1>
        <button onClick={onRetour} style={{ marginLeft: "auto", background: "rgba(255,255,255,.15)", border: "none", color: "#fff", padding: "7px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>← Accueil</button>
      </div>

      <div id="map">
        <MapContainer center={NDJAMENA} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <GestionClic onClic={poserPoint} />
          {ramassage && <Marker position={ramassage} icon={icone("#002664")} />}
          {livraison && <Marker position={livraison} icon={icone("#C60C30")} />}
          {ramassage && livraison && (
            routePoints
              ? <><Polyline positions={routePoints} pathOptions={{ color: "#fff", weight: 9, opacity: 0.9 }} /><Polyline positions={routePoints} pathOptions={{ color: "#16a34a", weight: 5 }} /></>
              : <Polyline positions={[ramassage, livraison]} pathOptions={{ color: "#FECB00", weight: 4, dashArray: "2,8" }} />
          )}
          <AjusterVue points={[ramassage, livraison]} />
        </MapContainer>
      </div>

      <div id="panel" className="glissable" style={{ transform: "translateY(0vh)", maxHeight: "62vh", overflowY: "auto" }}>
        <div className="panel-contenu">
          <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{ flex: 1, height: "5px", borderRadius: "3px", background: etape >= n ? "#16a34a" : "#e5e7eb" }}></div>
            ))}
          </div>

          {etape === 1 && (
            <>
              <h3 style={{ color: "#0d1117", marginBottom: "10px" }}>1. Mode de livraison</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                <div onClick={() => setMode("porte")} style={{ padding: "14px", borderRadius: "12px", cursor: "pointer", border: mode === "porte" ? "2px solid #16a34a" : "2px solid #e5e7eb", background: mode === "porte" ? "#dcfce7" : "#fff" }}>
                  <div style={{ fontWeight: 700, color: "#0d1117" }}>🚪 Porte-à-porte</div>
                  <div style={{ fontSize: "13px", color: "#6b7280" }}>Ramassage à l'adresse puis livraison à domicile</div>
                </div>
                <div onClick={() => setMode("agence")} style={{ padding: "14px", borderRadius: "12px", cursor: "pointer", border: mode === "agence" ? "2px solid #16a34a" : "2px solid #e5e7eb", background: mode === "agence" ? "#dcfce7" : "#fff" }}>
                  <div style={{ fontWeight: 700, color: "#0d1117" }}>🏢 Dépôt en agence</div>
                  <div style={{ fontSize: "13px", color: "#6b7280" }}>Dépôt dans une agence puis retrait par le destinataire</div>
                </div>
              </div>

              <h3 style={{ color: "#0d1117", marginBottom: "6px" }}>Points sur la carte</h3>
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <button onClick={() => setChampActif("ramassage")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: champActif === "ramassage" ? "2px solid #002664" : "2px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 700, color: "#002664" }}>
                  📍 Ramassage{ramassage ? " ✓" : ""}
                </button>
                <button onClick={() => setChampActif("livraison")} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: champActif === "livraison" ? "2px solid #C60C30" : "2px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 700, color: "#C60C30" }}>
                  🏁 Livraison{livraison ? " ✓" : ""}
                </button>
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
                Touchez la carte pour placer le point {champActif === "ramassage" ? "de ramassage" : "de livraison"}.
                {nomRamassage && nomRamassage !== "…" && <div>Ramassage : {nomRamassage}</div>}
                {nomLivraison && nomLivraison !== "…" && <div>Livraison : {nomLivraison}</div>}
              </div>
              <button onClick={() => { if (ramassage && livraison) setEtape(2); else setErreur("Placez les deux points."); }}
                style={{ width: "100%", border: "none", borderRadius: "11px", background: ramassage && livraison ? "#002664" : "#9ca3af", color: "#fff", fontWeight: 700, padding: "13px", cursor: "pointer", fontSize: "15px" }}>
                Continuer
              </button>
            </>
          )}

          {etape === 2 && (
            <>
              <h3 style={{ color: "#0d1117", marginBottom: "10px" }}>2. Taille du colis</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                {TAILLES_COLIS.map((t) => (
                  <div key={t.id} onClick={() => setTaille(t.id)} style={{ padding: "12px 14px", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", border: taille === t.id ? "2px solid #16a34a" : "2px solid #e5e7eb", background: taille === t.id ? "#dcfce7" : "#fff" }}>
                    <div style={{ fontSize: "26px" }}>{t.ic}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: "#0d1117" }}>{t.nom}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>{t.desc}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: "#002664", fontSize: "13px" }}>dès {t.base} F</div>
                  </div>
                ))}
              </div>
              <h3 style={{ color: "#0d1117", marginBottom: "6px" }}>Description (optionnel)</h3>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex : Documents importants, fragile..."
                style={{ width: "100%", border: "2px solid #e5e7eb", borderRadius: "10px", padding: "10px", fontSize: "14px", outline: "none", minHeight: "60px", marginBottom: "14px", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setEtape(1)} style={{ flex: 1, border: "2px solid #e5e7eb", borderRadius: "11px", background: "#fff", color: "#6b7280", fontWeight: 700, padding: "13px", cursor: "pointer" }}>Retour</button>
                <button onClick={() => setEtape(3)} style={{ flex: 2, border: "none", borderRadius: "11px", background: "#002664", color: "#fff", fontWeight: 700, padding: "13px", cursor: "pointer" }}>Continuer</button>
              </div>
            </>
          )}

          {etape === 3 && (
            <>
              <h3 style={{ color: "#0d1117", marginBottom: "10px" }}>3. Destinataire</h3>
              <input value={destNom} onChange={(e) => setDestNom(e.target.value)} placeholder="Nom du destinataire"
                style={{ width: "100%", border: "2px solid #e5e7eb", borderRadius: "10px", padding: "12px", fontSize: "14px", outline: "none", marginBottom: "10px" }} />
              <input value={destTel} onChange={(e) => setDestTel(e.target.value)} placeholder="Téléphone du destinataire" type="tel"
                style={{ width: "100%", border: "2px solid #e5e7eb", borderRadius: "10px", padding: "12px", fontSize: "14px", outline: "none", marginBottom: "14px" }} />

              <h3 style={{ color: "#0d1117", marginBottom: "8px" }}>Paiement</h3>
              <div id="pay" style={{ marginBottom: "14px" }}>
                {PAIEMENTS.map((p) => (
                  <div key={p.id} className={"pay-opt" + (paiement === p.id ? " sel" : "")} onClick={() => setPaiement(p.id)}>
                    <span className="ic">{p.ic}</span>{p.nom}
                  </div>
                ))}
              </div>

              {prix != null && (
                <div style={{ background: "#002664", borderRadius: "14px", padding: "16px", marginBottom: "14px", textAlign: "center" }}>
                  <div style={{ color: "#FECB00", fontSize: "28px", fontWeight: 800 }}>{prix.toLocaleString("fr-FR")} <small style={{ fontSize: "14px" }}>FCFA</small></div>
                  <div style={{ color: "#fff", fontSize: "12px", marginTop: "4px" }}>
                    {tailleChoisie.nom} · {distance != null ? distance.toFixed(1) : "?"} km · {mode === "porte" ? "Porte-à-porte" : "Agence"}
                  </div>
                </div>
              )}

              {erreur && <div style={{ color: "#C60C30", fontSize: "13px", textAlign: "center", marginBottom: "10px" }}>{erreur}</div>}

              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setEtape(2)} style={{ flex: 1, border: "2px solid #e5e7eb", borderRadius: "11px", background: "#fff", color: "#6b7280", fontWeight: 700, padding: "13px", cursor: "pointer" }}>Retour</button>
                <button onClick={commander} disabled={envoi} style={{ flex: 2, border: "none", borderRadius: "11px", background: "#16a34a", color: "#fff", fontWeight: 700, padding: "13px", cursor: "pointer" }}>
                  {envoi ? "Envoi..." : "Commander la livraison"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== STORY VIEWER (multi-pages façon Instagram) ===================== */
function StoryViewer({ banIndex, setBanIndex, onFermer }) {
  const [page, setPage] = useState(0);
  const banniere = BANNIERES[banIndex];
  const pages = banniere.pages;
  const pageActuelle = pages[page];
  const estDernierePage = page === pages.length - 1;

  useEffect(() => { setPage(0); }, [banIndex]);

  function suivant() {
    if (page < pages.length - 1) {
      setPage(page + 1);
    } else if (banIndex < BANNIERES.length - 1) {
      setBanIndex(banIndex + 1);
    } else {
      onFermer();
    }
  }
  function precedent() {
    if (page > 0) {
      setPage(page - 1);
    } else if (banIndex > 0) {
      setBanIndex(banIndex - 1);
    }
  }

  return (
    <div className="story-overlay">
      <div className="story-barres">
        {pages.map((_, i) => (
          <div key={i} className="story-barre">
            <div className="story-barre-rempli" style={{ width: i <= page ? "100%" : "0%" }}></div>
          </div>
        ))}
      </div>

      <button className="story-fermer" onClick={onFermer}>✕</button>

      <div className="story-tap story-tap-gauche" onClick={precedent}></div>
      <div className="story-tap story-tap-droite" onClick={suivant}></div>

      <div className="story-contenu">
        <img src={pageActuelle.img} alt={pageActuelle.titre} className="story-img"
          onError={(e) => { e.currentTarget.style.opacity = "0.15"; }} />
        <div className="story-texte-zone">
          <div className="story-titre">{pageActuelle.titre}</div>
          <div className="story-texte">{pageActuelle.texte}</div>
          {banniere.type === "chauffeur" && estDernierePage && (
            <a href={URL_CHAUFFEUR} target="_blank" rel="noopener noreferrer" className="story-btn">
              Devenir chauffeur →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== ÉCRAN ACCUEIL COURSE (voiture + bannières) ===================== */
function AccueilCourse({ onCommander, onRetour, onOuvrirStory, onChoisirLieu }) {
  return (
    <div className="acc-course-wrap">
      <div className="choix-header">
        <div id="logo-badge" style={{ width: 48, height: 48, borderRadius: 13 }}></div>
        <h1>Mira<span>Express</span></h1>
        <button onClick={onRetour} className="choix-deco">← Accueil</button>
      </div>

      <div className="acc-course-contenu">
        <div className="acc-voiture-zone">
          <img src="/voiture-accueil.png" alt="Mira Express" className="acc-voiture-img"
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div className="acc-voiture-txt">Mira Express · Votre course en ville</div>
        </div>

        <div className="acc-ou" onClick={onCommander}>
          <div className="acc-ou-ic">🔍</div>
          <div className="acc-ou-txt">Où allons-nous ?</div>
          <div className="acc-ou-fleche">›</div>
        </div>

        {/* Liste de lieux populaires (comme Yango) */}
        <div className="acc-lieux">
          {LIEUX_POPULAIRES.map((lieu, i) => (
            <div key={i} className="acc-lieu" onClick={() => onChoisirLieu(lieu)}>
              <div className="acc-lieu-ic">{lieu.ic}</div>
              <div className="acc-lieu-txt">
                <div className="acc-lieu-nom">{lieu.nom}</div>
                <div className="acc-lieu-quartier">{lieu.quartier}</div>
              </div>
              <div className="acc-lieu-min">{lieu.minIndicatif} min</div>
            </div>
          ))}
        </div>

        <button className="acc-commander-btn" onClick={onCommander}>
          Commander une course
        </button>

        <div className="acc-banniere acc-banniere-grande" onClick={() => onOuvrirStory(0)}>
          <img src={BANNIERES[0].vignette} alt="Bannière"
            onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
        </div>
        <div className="acc-bannieres-grille">
          {BANNIERES.slice(1).map((b, i) => (
            <div key={i + 1} className="acc-banniere acc-banniere-petite" onClick={() => onOuvrirStory(i + 1)}>
              <img src={b.vignette} alt="Bannière"
                onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Petite ligne label / valeur pour le panneau de détails */
function DetailLigne({ label, valeur }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #e5e7eb" }}>
      <span style={{ fontSize: "13px", color: "#6b7280" }}>{label}</span>
      <span style={{ fontSize: "14px", fontWeight: 700, color: "#0d1117", textAlign: "right", maxWidth: "60%" }}>{valeur}</span>
    </div>
  );
}

/* ===================== APP PRINCIPALE ===================== */
export default function Passager() {
  const [session, setSession] = useState(null);
  const [authPrete, setAuthPrete] = useState(false);
  const [service, setService] = useState(null);
  const [vueCommande, setVueCommande] = useState(false);
  const [storyIndex, setStoryIndex] = useState(null);

  const [champActif, setChampActif] = useState("depart");
  const [depart, setDepart] = useState(null);
  const [dest, setDest] = useState(null);
  const [nomDepart, setNomDepart] = useState(null);
  const [nomDest, setNomDest] = useState(null);
  const [texteDepart, setTexteDepart] = useState("");
  const [texteDest, setTexteDest] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [champRecherche, setChampRecherche] = useState(null);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const timerRecherche = useRef(null);
  const [categorie, setCategorie] = useState("eco");
  const [paiement, setPaiement] = useState("airtel");
  const [calcul, setCalcul] = useState(null);
  const [routePoints, setRoutePoints] = useState(null);
  const [routeChauffeur, setRouteChauffeur] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [courseId, setCourseId] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [posChauffeur, setPosChauffeur] = useState(null);
  const [statut, setStatut] = useState(null);
  const [showMotifs, setShowMotifs] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [noteChoisie, setNoteChoisie] = useState(0);
  const [tagsChoisis, setTagsChoisis] = useState([]);
  const [chatOuvert, setChatOuvert] = useState(false);
  const [messages, setMessages] = useState([]);
  const [nouveauMsg, setNouveauMsg] = useState("");
  const finChatRef = useRef(null);
  const [niveau, setNiveau] = useState("moyen");
  const [offset, setOffset] = useState(POSITIONS.moyen);
  const [sansAnim, setSansAnim] = useState(false);
  const dragRef = useRef({ actif: false, yDepart: 0, offsetDepart: 0 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthPrete(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function deconnexion() {
    await supabase.auth.signOut();
    setService(null);
    setVueCommande(false);
    reinitialiser();
  }

  async function nomDuLieu(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=fr`;
      const rep = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!rep.ok) return null;
      const data = await rep.json();
      const a = data.address || {};
      const partie =
        a.road || a.pedestrian || a.neighbourhood || a.suburb ||
        a.quarter || a.city_district || a.hamlet || a.village || a.town || a.city || null;
      if (partie) return partie;
      if (data.display_name) return data.display_name.split(",")[0];
      return null;
    } catch (e) {
      return null;
    }
  }

  function poserPoint(lat, lng) {
    if (confirm) return;
    if (champActif === "depart") {
      setDepart([lat, lng]);
      setNomDepart("…");
      nomDuLieu(lat, lng).then((nom) => { setNomDepart(nom); if (nom) setTexteDepart(nom); });
      if (!dest) setChampActif("dest");
    } else {
      setDest([lat, lng]);
      setNomDest("…");
      nomDuLieu(lat, lng).then((nom) => { setNomDest(nom); if (nom) setTexteDest(nom); });
    }
    setSuggestions([]);
    setChampRecherche(null);
  }

  // Détecte la position actuelle de l'utilisateur et la place comme départ.
  function utiliserMaPosition() {
    if (!navigator.geolocation) { setTexteDepart(""); return; }
    setTexteDepart("Localisation…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setDepart([lat, lng]);
        setNomDepart("Position actuelle");
        setTexteDepart("Position actuelle");
        if (!dest) setChampActif("dest");
      },
      () => { setTexteDepart(""); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );
  }

  // Au premier affichage de l'écran de commande, on tente la position actuelle.
  useEffect(() => {
    if (vueCommande && !depart && !confirm) {
      utiliserMaPosition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vueCommande]);

  async function chercherLieux(q) {
    if (!q || q.trim().length < 3) { setSuggestions([]); setRechercheEnCours(false); return; }
    setRechercheEnCours(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q + ", N'Djamena, Tchad")}&limit=6&addressdetails=1&accept-language=fr`;
      const rep = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!rep.ok) { setSuggestions([]); setRechercheEnCours(false); return; }
      const data = await rep.json();
      const liste = (data || []).map((item) => {
        const a = item.address || {};
        const principal = a.road || a.pedestrian || a.neighbourhood || a.suburb || a.quarter || item.name || (item.display_name || "").split(",")[0];
        const secondaire = a.suburb || a.city_district || a.city || a.town || "N'Djamena";
        return { principal, secondaire, lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
      });
      setSuggestions(liste);
    } catch (e) {
      setSuggestions([]);
    }
    setRechercheEnCours(false);
  }

  function onSaisie(champ, valeur) {
    if (champ === "depart") setTexteDepart(valeur);
    else setTexteDest(valeur);
    setChampRecherche(champ);
    if (timerRecherche.current) clearTimeout(timerRecherche.current);
    timerRecherche.current = setTimeout(() => chercherLieux(valeur), 450);
  }

  function choisirSuggestion(s) {
    const point = [s.lat, s.lng];
    const nomComplet = s.principal;
    if (champRecherche === "depart") {
      setDepart(point); setNomDepart(nomComplet); setTexteDepart(nomComplet);
      if (!dest) setChampActif("dest");
    } else {
      setDest(point); setNomDest(nomComplet); setTexteDest(nomComplet);
    }
    setSuggestions([]);
    setChampRecherche(null);
  }

  useEffect(() => {
    if (!depart || !dest) { setRoutePoints(null); return; }
    const kmVol = distanceKm(depart, dest) * 1.35;
    setCalcul({ km: kmVol, min: (kmVol / VITESSE_MOY) * 60, pointe: estHeurePointe() });
    allerVers("plein");
    let annule = false;
    calculerRoute(depart, dest).then((res) => {
      if (annule || !res) return;
      setRoutePoints(res.points);
      const min = (res.distanceKm / VITESSE_MOY) * 60;
      setCalcul({ km: res.distanceKm, min, pointe: estHeurePointe() });
    });
    return () => { annule = true; };
  }, [depart, dest]);

  // Trajet du chauffeur vers le point de prise en charge (comme Yango).
  // Actif seulement tant que le chauffeur est en route (course pas encore démarrée).
  useEffect(() => {
    const enRoute = confirm && confirm.chauffeur && !confirm.demarree;
    if (!enRoute || !posChauffeur || !depart) { setRouteChauffeur(null); return; }
    let annule = false;
    calculerRoute(posChauffeur, depart).then((res) => {
      if (annule || !res) { setRouteChauffeur(null); return; }
      setRouteChauffeur(res.points);
    });
    return () => { annule = true; };
  }, [posChauffeur, depart, confirm]);

  const catChoisie = CATEGORIES.find((c) => c.id === categorie);
  const prixActuel = calcul ? prixCategorie(catChoisie, calcul.km, calcul.pointe) : null;

  let minutesArrivee = null;
  if (posChauffeur && depart) {
    const distCh = distanceKm(posChauffeur, depart) * 1.35;
    minutesArrivee = Math.max(1, Math.round((distCh / VITESSE_MOY) * 60));
  }

  function allerVers(nom) { setNiveau(nom); setOffset(POSITIONS[nom]); setSansAnim(false); }
  function debutDrag(clientY) {
    dragRef.current = { actif: true, yDepart: clientY, offsetDepart: offset, offsetCourant: offset };
    setSansAnim(true);
    function onMove(e) { pendantDrag(e.clientY); }
    function onUp() {
      finDrag();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function pendantDrag(clientY) {
    if (!dragRef.current.actif) return;
    const deltaPx = clientY - dragRef.current.yDepart;
    const deltaPct = (deltaPx / window.innerHeight) * 100;
    let nouvel = dragRef.current.offsetDepart + deltaPct;
    if (nouvel < POSITIONS.plein) nouvel = POSITIONS.plein;
    if (nouvel > POSITIONS.petit) nouvel = POSITIONS.petit;
    dragRef.current.offsetCourant = nouvel;
    setOffset(nouvel);
  }
  function finDrag() {
    if (!dragRef.current.actif) return;
    dragRef.current.actif = false;
    const courant = dragRef.current.offsetCourant;
    const candidats = [["plein", POSITIONS.plein], ["moyen", POSITIONS.moyen], ["petit", POSITIONS.petit]];
    let meilleur = candidats[0], ecartMin = Infinity;
    for (const c of candidats) {
      const ecart = Math.abs(courant - c[1]);
      if (ecart < ecartMin) { ecartMin = ecart; meilleur = c; }
    }
    allerVers(meilleur[0]);
  }
  async function commander() {
    if (!calcul) return;
    setErreur(null);
    const nouvelleCourse = {
      depart_lat: depart[0], depart_lng: depart[1],
      dest_lat: dest[0], dest_lng: dest[1],
      classe: categorie,
      prix_fcfa: prixActuel,
      distance_km: parseFloat(calcul.km.toFixed(1)),
      duree_min: Math.round(calcul.min),
      mode_paiement: paiement, statut: "recherche",
      code_demarrage: String(Math.floor(1000 + Math.random() * 9000)),
    };
    const { data, error } = await supabase.from("courses").insert(nouvelleCourse).select().single();
    if (error) { setErreur(error.message); return; }
    setCourseId(data.id);
    setStatut("recherche");
    setConfirm({ prix: prixActuel, payNom: PAIEMENTS.find((p) => p.id === paiement).nom, catNom: catChoisie.nom, code: data.code_demarrage });
    allerVers("moyen");
  }

  useEffect(() => {
    if (!courseId) return;
    const canal = supabase
      .channel("course-" + courseId)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "courses", filter: "id=eq." + courseId },
        (payload) => {
          const c = payload.new;
          setStatut(c.statut);
          if (c.chauffeur_nom) {
            setConfirm((prev) => ({
              ...prev,
              chauffeur: { nom: c.chauffeur_nom, plate: c.chauffeur_plaque, car: c.chauffeur_vehicule, tel: c.chauffeur_tel },
            }));
          }
          if (c.chauffeur_lat && c.chauffeur_lng) setPosChauffeur([c.chauffeur_lat, c.chauffeur_lng]);
          if (c.demarree) setConfirm((prev) => ({ ...prev, demarree: true }));
          if (c.statut === "annulee" && c.annule_par === "chauffeur") {
            setConfirm((prev) => ({ ...prev, annuleParChauffeur: true, motif: c.motif_annulation }));
          }
          if (c.statut === "terminee") setConfirm((prev) => ({ ...prev, termine: true }));
        }
      ).subscribe();
    return () => supabase.removeChannel(canal);
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    (async () => {
      const { data } = await supabase.from("messages").select("*").eq("course_id", courseId).order("created_at", { ascending: true });
      if (data) setMessages(data);
    })();
    const canalChat = supabase
      .channel("chat-" + courseId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "course_id=eq." + courseId },
        (payload) => { setMessages((prev) => [...prev, payload.new]); }
      ).subscribe();
    return () => supabase.removeChannel(canalChat);
  }, [courseId]);

  useEffect(() => {
    if (chatOuvert && finChatRef.current) finChatRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatOuvert]);

  async function envoyerMessage() {
    const texte = nouveauMsg.trim();
    if (!texte || !courseId) return;
    setNouveauMsg("");
    await supabase.from("messages").insert({ course_id: courseId, expediteur: "client", contenu: texte });
  }
  async function annulerClient(motif) {
    if (!courseId) return;
    await supabase.from("courses").update({ statut: "annulee", annule_par: "client", motif_annulation: motif }).eq("id", courseId);
    reinitialiser();
  }
  async function envoyerNote() {
    if (courseId && noteChoisie > 0) {
      await supabase.from("courses").update({ note: noteChoisie, tags: tagsChoisis.join(", ") }).eq("id", courseId);
    }
    reinitialiser();
  }
  function toggleTag(id) { setTagsChoisis((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]); }
  function reinitialiser() {
    setConfirm(null); setCourseId(null); setPosChauffeur(null); setStatut(null);
    setShowMotifs(false); setShowDetails(false); setNoteChoisie(0); setTagsChoisis([]);
    setChatOuvert(false); setMessages([]); setNouveauMsg("");
    setDepart(null); setDest(null); setNomDepart(null); setNomDest(null); setCalcul(null); setChampActif("depart");
    setTexteDepart(""); setTexteDest(""); setSuggestions([]); setChampRecherche(null);
    setRoutePoints(null);
    setRouteChauffeur(null);
    allerVers("moyen");
  }

  if (!authPrete) {
    return <div id="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#002664" }}><div style={{ color: "#fff" }}>Chargement...</div></div>;
  }
  if (!session) {
    return <div id="app"><Accueil /></div>;
  }

  if (!service) {
    return <div id="app"><EcranChoix onChoix={(s) => { setService(s); setVueCommande(false); }} onDeconnexion={deconnexion} /></div>;
  }

  if (service === "colis") {
    return <div id="app"><EcranColis onRetour={() => setService(null)} session={session} /></div>;
  }

  if (service === "course" && !vueCommande) {
    return (
      <div id="app">
        <AccueilCourse
          onCommander={() => setVueCommande(true)}
          onRetour={() => { reinitialiser(); setService(null); }}
          onOuvrirStory={(i) => setStoryIndex(i)}
          onChoisirLieu={(lieu) => {
            setDest([lieu.lat, lieu.lng]);
            setNomDest(lieu.nom);
            setTexteDest(lieu.nom);
            setChampActif("depart");
            setVueCommande(true);
          }}
        />
        {storyIndex !== null && (
          <StoryViewer banIndex={storyIndex} setBanIndex={setStoryIndex} onFermer={() => setStoryIndex(null)} />
        )}
      </div>
    );
  }

  return (
    <div id="app">
      <div id="header">
        <div id="logo-badge"></div>
        <h1>Mira<span> Express</span><small>Votre trajet, notre priorité</small></h1>
        <button onClick={() => { reinitialiser(); setVueCommande(false); }} style={{ marginLeft: "auto", background: "rgba(255,255,255,.15)", border: "none", color: "#fff", padding: "7px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
          ← Retour
        </button>
      </div>

      <div id="map">
        <MapContainer center={NDJAMENA} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <GestionClic onClic={poserPoint} />
          {depart && <Marker position={depart} icon={icone("#002664")} />}
          {dest && <Marker position={dest} icon={icone("#C60C30")} />}

          {/* Chauffeur en route vers le client : on montre le trajet chauffeur -> départ (comme Yango) */}
          {confirm && confirm.chauffeur && !confirm.demarree && posChauffeur && depart ? (
            routeChauffeur ? (
              <>
                <Polyline positions={routeChauffeur} pathOptions={{ color: "#fff", weight: 9, opacity: 0.9 }} />
                <Polyline positions={routeChauffeur} pathOptions={{ color: "#16a34a", weight: 5 }} />
              </>
            ) : (
              <Polyline positions={[posChauffeur, depart]} pathOptions={{ color: "#16a34a", weight: 5, dashArray: "2,8" }} />
            )
          ) : (
            /* Sinon : trajet de la course départ -> destination */
            depart && dest && (
              routePoints ? (
                <>
                  <Polyline positions={routePoints} pathOptions={{ color: "#fff", weight: 9, opacity: 0.9 }} />
                  <Polyline positions={routePoints} pathOptions={{ color: "#16a34a", weight: 5 }} />
                </>
              ) : (
                <Polyline positions={[depart, dest]} pathOptions={{ color: "#FECB00", weight: 4, dashArray: "2,8" }} />
              )
            )
          )}

          {posChauffeur && <Marker position={posChauffeur} icon={iconeVoiture(couleurVers((confirm?.chauffeur?.car || "").split("·").pop()))} />}
          <AjusterVue points={[posChauffeur, depart, dest]} />
        </MapContainer>
      </div>

      {!confirm && (!depart || !dest) && (
        <div id="hint">
          {champActif === "depart" ? "📍 Tapez sur la carte pour le départ" : "🏁 Tapez sur la carte pour la destination"}
        </div>
      )}

      {!confirm && (
        <div id="panel" className={"glissable" + (sansAnim ? " sansanim" : "")} style={{ transform: `translateY(${offset}vh)` }}>
          <div className="grip-zone"
            onMouseDown={(e) => debutDrag(e.clientY)}
            onTouchStart={(e) => debutDrag(e.touches[0].clientY)}
            onTouchMove={(e) => pendantDrag(e.touches[0].clientY)}
            onTouchEnd={finDrag}>
            <div id="panel-grip"></div>
          </div>

          <div className="panel-contenu">
            <div className={"field" + (champActif === "depart" ? " active" : "")}>
              <div className="dot depart"></div>
              <div style={{ flex: 1 }}>
                <div className="label">Départ</div>
                <input
                  className="field-input"
                  type="text"
                  value={texteDepart}
                  placeholder="Tapez un lieu ou touchez la carte"
                  onFocus={() => { setChampActif("depart"); setChampRecherche("depart"); }}
                  onChange={(e) => onSaisie("depart", e.target.value)}
                />
              </div>
              <button className="btn-ma-position" onClick={utiliserMaPosition} title="Utiliser ma position actuelle">
                📍
              </button>
            </div>

            {champRecherche === "depart" && (suggestions.length > 0 || rechercheEnCours) && (
              <div className="suggestions">
                {rechercheEnCours && <div className="sugg-info">Recherche…</div>}
                {suggestions.map((s, i) => (
                  <div key={i} className="sugg-item" onClick={() => choisirSuggestion(s)}>
                    <span className="sugg-pin">📍</span>
                    <div>
                      <div className="sugg-principal">{s.principal}</div>
                      <div className="sugg-secondaire">{s.secondaire}</div>
                    </div>
                  </div>
                ))}
                {!rechercheEnCours && suggestions.length === 0 && (
                  <div className="sugg-info">Aucun lieu trouvé — touchez la carte pour placer le point.</div>
                )}
              </div>
            )}

            <div className={"field" + (champActif === "dest" ? " active" : "")}>
              <div className="dot dest"></div>
              <div style={{ flex: 1 }}>
                <div className="label">Destination</div>
                <input
                  className="field-input"
                  type="text"
                  value={texteDest}
                  placeholder="Où allez-vous ?"
                  onFocus={() => { setChampActif("dest"); setChampRecherche("dest"); }}
                  onChange={(e) => onSaisie("dest", e.target.value)}
                />
              </div>
            </div>

            {champRecherche === "dest" && (suggestions.length > 0 || rechercheEnCours) && (
              <div className="suggestions">
                {rechercheEnCours && <div className="sugg-info">Recherche…</div>}
                {suggestions.map((s, i) => (
                  <div key={i} className="sugg-item" onClick={() => choisirSuggestion(s)}>
                    <span className="sugg-pin">📍</span>
                    <div>
                      <div className="sugg-principal">{s.principal}</div>
                      <div className="sugg-secondaire">{s.secondaire}</div>
                    </div>
                  </div>
                ))}
                {!rechercheEnCours && suggestions.length === 0 && (
                  <div className="sugg-info">Aucun lieu trouvé — touchez la carte pour placer le point.</div>
                )}
              </div>
            )}

            {calcul && (
              <div id="estimate" className="show">
                <div className="row">
                  <div id="est-price">{prixActuel.toLocaleString("fr-FR")} <small>FCFA</small></div>
                  <div id="est-meta">📏 {calcul.km.toFixed(1)} km<br />⏱ ~{Math.round(calcul.min)} min</div>
                </div>
                {calcul.pointe && (
                  <div style={{ background: "rgba(254,203,0,.2)", color: "#FECB00", fontSize: "12px", fontWeight: 700, padding: "6px 10px", borderRadius: "8px", marginTop: "10px", textAlign: "center" }}>
                    ⚡ +20% heure de pointe
                  </div>
                )}
                <div id="classes">
                  {CATEGORIES.map((c) => (
                    <div key={c.id} className={"class-card" + (categorie === c.id ? " sel" : "")}
                      onClick={() => setCategorie(c.id)}>
                      <div className="ic">{c.ic}</div>
                      <div className="nm">{c.nom}</div>
                      <div className="pr">{prixCategorie(c, calcul.km, calcul.pointe).toLocaleString("fr-FR")} F</div>
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
        </div>
      )}

      {confirm && (
        <div id="panel" className={"glissable" + (sansAnim ? " sansanim" : "")} style={{ transform: `translateY(${offset}vh)` }}>
          <div className="grip-zone"
            onMouseDown={(e) => debutDrag(e.clientY)}
            onTouchStart={(e) => debutDrag(e.touches[0].clientY)}
            onTouchMove={(e) => pendantDrag(e.touches[0].clientY)}
            onTouchEnd={finDrag}>
            <div id="panel-grip"></div>
          </div>

          {confirm.termine ? (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <h2 style={{ color: "#0d1117", margin: "0 0 4px" }}>
                Vous êtes arrivé : {confirm.prix ? confirm.prix.toLocaleString("fr-FR") : ""} FCFA
              </h2>
              <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "14px" }}>
                {confirm.chauffeur ? confirm.chauffeur.nom : ""}
              </p>
              <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "10px" }}>Qu'avez-vous aimé ?</div>
              <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "14px" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} onClick={() => setNoteChoisie(n)}
                    style={{ fontSize: "34px", cursor: "pointer", color: n <= noteChoisie ? "#FECB00" : "#d1d5db", transition: "color .15s" }}>★</span>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", marginBottom: "16px" }}>
                {TAGS_NOTE.map((t) => (
                  <div key={t.id} onClick={() => toggleTag(t.id)}
                    style={{
                      padding: "8px 12px", borderRadius: "20px", fontSize: "13px", cursor: "pointer",
                      border: tagsChoisis.includes(t.id) ? "2px solid #16a34a" : "2px solid #e5e7eb",
                      background: tagsChoisis.includes(t.id) ? "#dcfce7" : "#fff", color: "#0d1117",
                    }}>
                    {t.ic} {t.nom}
                  </div>
                ))}
              </div>
              <button id="close-confirm" onClick={envoyerNote}>{noteChoisie > 0 ? "Terminer" : "Passer"}</button>
            </div>

          ) : confirm.annuleParChauffeur ? (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div className="check" style={{ background: "#C60C30", color: "#fff" }}>!</div>
              <h2 style={{ color: "#C60C30", margin: "10px 0 6px" }}>Course annulée</h2>
              <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "12px" }}>
                Le chauffeur a annulé la course.<br />
                {confirm.motif ? `Motif : ${confirm.motif}` : ""}
              </p>
              <button id="close-confirm" onClick={reinitialiser}>Rechercher un autre chauffeur</button>
            </div>

          ) : !confirm.chauffeur ? (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div className="check" style={{ background: "#FECB00", color: "#002664" }}>&#9203;</div>
              <h2 style={{ color: "#0d1117", margin: "10px 0 6px" }}>Recherche en cours...</h2>
              <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "12px" }}>En attente d'un chauffeur.</p>
              <div className="car-info" style={{ justifyContent: "center" }}>
                <div>
                  <div className="driver-nm">{confirm.catNom} · {confirm.prix.toLocaleString("fr-FR")} FCFA</div>
                  <div className="driver-meta">Paiement : {confirm.payNom}</div>
                </div>
              </div>
              {!showMotifs ? (
                <button id="close-confirm" style={{ background: "#C60C30" }} onClick={() => annulerClient("Annulation pendant la recherche")}>
                  Annuler la demande
                </button>
              ) : null}
            </div>

          ) : (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              {confirm.demarree ? (
                <>
                  <h2 style={{ color: "#16a34a", margin: "0 0 8px" }}>🚗 Course en cours</h2>
                  <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "12px" }}>
                    Vous êtes en route vers votre destination. Bon voyage !
                  </p>
                </>
              ) : (
                <>
                  <h2 style={{ color: "#16a34a", margin: "0 0 8px" }}>✓ Chauffeur en route !</h2>
                  <p style={{ color: "#6b7280", fontSize: "13px", marginBottom: "10px" }}>
                    {posChauffeur ? "Suivez sa position sur la carte" : "Votre chauffeur arrive bientôt"}
                  </p>
                  {minutesArrivee && (
                    <div style={{ display: "inline-block", background: "#dcfce7", color: "#16a34a", fontWeight: 800, fontSize: "14px", padding: "8px 16px", borderRadius: "20px", marginBottom: "12px" }}>
                      🚗 Arrivée dans ~{minutesArrivee} min
                    </div>
                  )}
                </>
              )}

              {confirm.code && !confirm.demarree && (
                <div style={{ background: "#002664", borderRadius: "14px", padding: "14px", marginBottom: "12px" }}>
                  <div style={{ color: "#fff", fontSize: "12px", marginBottom: "8px" }}>
                    Communiquez ce code à votre chauffeur pour démarrer la course
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                    {confirm.code.split("").map((chiffre, i) => (
                      <div key={i} style={{ background: "#fff", color: "#002664", fontSize: "26px", fontWeight: 800, width: "44px", height: "54px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {chiffre}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="car-info">
                <div className="plate">{confirm.chauffeur.plate}</div>
                <div>
                  <div className="driver-nm">{confirm.chauffeur.nom}</div>
                  <div className="driver-meta">{confirm.chauffeur.car}</div>
                </div>
              </div>
              <p style={{ color: "#6b7280", fontSize: "13px", margin: "8px 0" }}>
                {confirm.catNom} · <b>{confirm.prix.toLocaleString("fr-FR")} FCFA</b> · {confirm.payNom}
              </p>

              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                {confirm.chauffeur.tel ? (
                  <a href={"tel:" + confirm.chauffeur.tel}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: "15px", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    📞 Appeler
                  </a>
                ) : null}
                <button onClick={() => setChatOuvert(true)}
                  style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", cursor: "pointer", background: "#002664", color: "#fff", fontWeight: 700, fontSize: "15px" }}>
                  💬 Discussion
                </button>
              </div>

              <button onClick={() => setShowDetails(true)}
                style={{ width: "100%", padding: "12px", marginBottom: "8px", borderRadius: "12px", border: "2px solid #002664", cursor: "pointer", background: "#fff", color: "#002664", fontWeight: 700, fontSize: "15px" }}>
                📋 Détails de la course
              </button>

              {!confirm.demarree && (
                !showMotifs ? (
                  <button id="close-confirm" style={{ background: "#C60C30" }} onClick={() => setShowMotifs(true)}>
                    Annuler la course
                  </button>
                ) : (
                  <div style={{ textAlign: "left", marginTop: "10px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px", textAlign: "center" }}>Pourquoi annulez-vous ?</div>
                    {MOTIFS.map((m) => (
                      <button key={m} className="motif-btn" onClick={() => annulerClient(m)}>{m}</button>
                    ))}
                    <button className="motif-retour" onClick={() => setShowMotifs(false)}>Retour</button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {showDetails && confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end" }}
          onClick={() => setShowDetails(false)}>
          <div style={{ background: "#fff", width: "100%", borderRadius: "20px 20px 0 0", padding: "20px", maxHeight: "80%", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
              <div style={{ width: "40px", height: "4px", borderRadius: "4px", background: "#d1d5db" }}></div>
            </div>
            <h2 style={{ color: "#0d1117", marginBottom: "4px", textAlign: "center" }}>Détails de la course</h2>
            <p style={{ color: confirm.demarree ? "#16a34a" : "#FECB00", fontSize: "13px", fontWeight: 700, textAlign: "center", marginBottom: "18px" }}>
              {confirm.demarree ? "🚗 Course en cours" : "⏳ En attente de démarrage"}
            </p>

            <div style={{ background: "#f3f4f6", borderRadius: "14px", padding: "16px", marginBottom: "12px" }}>
              <DetailLigne label="Chauffeur" valeur={confirm.chauffeur?.nom || "—"} />
              <DetailLigne label="Véhicule" valeur={confirm.chauffeur?.car || "—"} />
              <DetailLigne label="Plaque" valeur={confirm.chauffeur?.plate || "—"} />
              {confirm.chauffeur?.tel && <DetailLigne label="Téléphone" valeur={confirm.chauffeur.tel} />}
            </div>

            <div style={{ background: "#f3f4f6", borderRadius: "14px", padding: "16px", marginBottom: "12px" }}>
              <DetailLigne label="Catégorie" valeur={confirm.catNom} />
              <DetailLigne label="Prix" valeur={confirm.prix.toLocaleString("fr-FR") + " FCFA"} />
              <DetailLigne label="Paiement" valeur={confirm.payNom} />
              {nomDepart && nomDepart !== "…" && <DetailLigne label="Départ" valeur={nomDepart} />}
              {nomDest && nomDest !== "…" && <DetailLigne label="Destination" valeur={nomDest} />}
              {calcul && <DetailLigne label="Distance" valeur={calcul.km.toFixed(1) + " km"} />}
              {calcul && <DetailLigne label="Durée estimée" valeur={"~" + Math.round(calcul.min) + " min"} />}
            </div>

            <button onClick={() => setShowDetails(false)}
              style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", cursor: "pointer", background: "#002664", color: "#fff", fontWeight: 700, fontSize: "15px" }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {chatOuvert && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", borderBottom: "1px solid #e5e7eb", background: "#002664", color: "#fff" }}>
            <button onClick={() => setChatOuvert(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: "22px", cursor: "pointer" }}>←</button>
            <div>
              <div style={{ fontWeight: 700 }}>{confirm?.chauffeur?.nom || "Chauffeur"}</div>
              <div style={{ fontSize: "12px", opacity: 0.8 }}>{confirm?.chauffeur?.car || ""}</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#f3f4f6" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#9ca3af", marginTop: "30px", fontSize: "14px" }}>
                Démarrez la conversation avec votre chauffeur
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.expediteur === "client" ? "flex-end" : "flex-start", marginBottom: "8px" }}>
                <div style={{
                  maxWidth: "75%", padding: "10px 14px", borderRadius: "16px", fontSize: "14px",
                  background: m.expediteur === "client" ? "#002664" : "#fff",
                  color: m.expediteur === "client" ? "#fff" : "#0d1117",
                  borderBottomRightRadius: m.expediteur === "client" ? "4px" : "16px",
                  borderBottomLeftRadius: m.expediteur === "client" ? "16px" : "4px",
                  boxShadow: "0 1px 2px rgba(0,0,0,.1)",
                }}>
                  {m.contenu}
                </div>
              </div>
            ))}
            <div ref={finChatRef} />
          </div>
          <div style={{ display: "flex", gap: "8px", padding: "12px", borderTop: "1px solid #e5e7eb", background: "#fff" }}>
            <input type="text" value={nouveauMsg}
              onChange={(e) => setNouveauMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") envoyerMessage(); }}
              placeholder="Votre message..."
              style={{ flex: 1, padding: "12px 14px", borderRadius: "24px", border: "1px solid #d1d5db", fontSize: "14px", outline: "none" }} />
            <button onClick={envoyerMessage}
              style={{ padding: "0 18px", borderRadius: "24px", border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "15px" }}>
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
