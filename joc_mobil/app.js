import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot,
  doc, getDoc, setDoc, updateDoc, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── CONFIGURA AQUÍ ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDuHxOAU3hiL-8uUYuFyzP-mTyUCTR-wmw",
  authDomain: "konehoot.firebaseapp.com",
  projectId: "konehoot",
  storageBucket: "konehoot.firebasestorage.app",
  messagingSenderId: "357275257330",
  appId: "1:357275257330:web:a45bd66abb86a0747e836b"
};
// ─────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── Estat ─────────────────────────────────────────────────────────────
let nom          = '';
let preguntes    = [];
let partida      = {};
let haRespost    = false;
let timerInterval = null;
let tempsRestant  = 0;
let tempsInici    = 0;
let subscripcionsIniciades = false;
let jugadorDocId  = '';

// ── Nom d'usuari ──────────────────────────────────────────────────────
const LS_NOM = 'konehoot_nom_joc';

function normalitzarJugadorId(rawNom) {
  const base = String(rawNom || '')
    .trim()
    .toLowerCase()
    .replace(/[.#$\[\]/]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
  return base || ('jugador_' + Math.random().toString(36).slice(2, 10));
}

function iniciarSeleccioNom() {
  const nomDesat = localStorage.getItem(LS_NOM);
  if (nomDesat) {
    document.getElementById('nom-desat').textContent = nomDesat;
    document.getElementById('bloc-nom-desat').style.display = 'flex';
  }
  mostrarScreen('screen-nom');
}

window.usarNomDesat = function() {
  nom = localStorage.getItem(LS_NOM);
  if (nom) entrarAlJoc();
};

window.usarNomNou = function() {
  document.getElementById('bloc-nom-desat').style.display = 'none';
  document.getElementById('nom-input').focus();
};

window.confirmarNom = function() {
  const val = document.getElementById('nom-input').value.trim();
  if (!val) {
    document.getElementById('nom-input').classList.add('error');
    setTimeout(() => document.getElementById('nom-input').classList.remove('error'), 600);
    return;
  }
  nom = val;
  jugadorDocId = normalitzarJugadorId(nom);
  localStorage.setItem(LS_NOM, nom);
  entrarAlJoc();
};

document.addEventListener('DOMContentLoaded', () => {
  iniciarSeleccioNom();
  document.getElementById('nom-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') window.confirmarNom();
  });
});

// ── Entrar al joc ─────────────────────────────────────────────────────
async function entrarAlJoc() {
  if (!jugadorDocId) jugadorDocId = normalitzarJugadorId(nom);
  document.getElementById('nom-confirmat').textContent = nom;
  const connStatusEl = document.getElementById('mob-conn-status');
  if (connStatusEl) {
    connStatusEl.style.display = 'none';
    connStatusEl.textContent = '';
  }
  try {
      await setDoc(
      doc(db, 'partida', 'estat', 'jugadors', jugadorDocId),
      { nom, punts: 0, connectatAt: serverTimestamp() },
      { merge: true }
    );
  } catch(e) {
    console.error('No s\'ha pogut registrar el jugador:', e);
    if (connStatusEl) {
      connStatusEl.style.display = 'block';
      connStatusEl.textContent = 'No s\'ha pogut registrar el jugador. Recarrega la pagina.';
    }
  }
  mostrarScreen('screen-espera');
  if (!subscripcionsIniciades) {
    iniciarSubscripcions();
    subscripcionsIniciades = true;
  }
}

function iniciarSubscripcions() {
  // Preguntes
  onSnapshot(query(collection(db, 'preguntes'), orderBy('ordre', 'asc')), snap => {
    preguntes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

  // Estat partida
  onSnapshot(doc(db, 'partida', 'estat'), snap => {
    if (!snap.exists()) {
      mostrarScreen('screen-espera');
      return;
    }
    const nouEstat = snap.data();
    const canviPregunta = nouEstat.preguntaIndex !== partida.preguntaIndex;
    partida = nouEstat;

    if (canviPregunta) haRespost = false;

    const fase = partida.fase || 'espera';
    if (fase === 'espera')        mostrarScreen('screen-espera');
    else if (fase === 'pregunta') renderPregunta();
    else if (fase === 'resultats') mostrarResultatsUsuari();
    else if (fase === 'final')    mostrarFinalUsuari();
  });
}

// ── PREGUNTA ──────────────────────────────────────────────────────────
function renderPregunta() {
  const idx = partida.preguntaIndex ?? 0;
  const p   = preguntes[idx];
  if (!p) return;

  haRespost = false;
  tempsInici = Date.now();

  if (haRespost) {
    mostrarEsperant();
    return;
  }

  // Reset botons
  document.querySelectorAll('.resp-btn').forEach(b => {
    b.classList.remove('seleccionada','correcta','incorrecta','disabled');
    b.disabled = false;
  });
  document.getElementById('mob-num').textContent = `${idx + 1} / ${preguntes.length}`;
  document.getElementById('mob-autor').textContent = `De: ${p.autor}`;
  document.getElementById('mob-pregunta').textContent = p.pregunta;

  const lletres = ['A','B','C','D'];
  p.respostes.forEach((r, i) => {
    const btn = document.getElementById(`mob-r${i}`);
    btn.querySelector('.btn-lletra').textContent = lletres[i];
    btn.querySelector('.btn-text').textContent   = r;
  });

  mostrarScreen('screen-pregunta');

  // Timer
  tempsRestant = partida.tempsPregunta || 20;
  renderTimerMobil();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    tempsRestant--;
    renderTimerMobil();
    if (tempsRestant <= 0) {
      clearInterval(timerInterval);
      if (!haRespost) bloquejatSenseResposta();
    }
  }, 1000);
}

function renderTimerMobil() {
  const el   = document.getElementById('mob-timer-num');
  const fill = document.getElementById('mob-timer-fill');
  const total = partida.tempsPregunta || 20;
  const pct   = tempsRestant / total;
  el.textContent   = tempsRestant;
  fill.style.width = (pct * 100) + '%';
  fill.style.background = tempsRestant > total * 0.4
    ? 'var(--c2)' : tempsRestant > total * 0.2
    ? '#ffb800' : 'var(--c3)';
}

function bloquejatSenseResposta() {
  document.querySelectorAll('.resp-btn').forEach(b => {
    b.disabled = true;
    b.classList.add('disabled');
  });
  document.getElementById('mob-status').textContent = 'Temps esgotat!';
  document.getElementById('mob-status').style.display = 'block';
}

// ── Respondre ─────────────────────────────────────────────────────────
window.respondre = async function(idx) {
  if (haRespost) return;
  haRespost = true;
  clearInterval(timerInterval);

  const total = partida.tempsPregunta || 20;
  const tempsUsat = (Date.now() - tempsInici) / 1000;
  const tempsRapidesa = Math.max(0, total - tempsUsat);
  // Puntuació: 1000 base + fins 500 per rapidesa
  const punts = Math.round(1000 + (tempsRapidesa / total) * 500);

  // Marca el botó
  document.querySelectorAll('.resp-btn').forEach((b, i) => {
    b.disabled = true;
    if (i === idx) b.classList.add('seleccionada');
    else b.classList.add('disabled');
  });

  try {
    // Desa resposta
    await setDoc(
      doc(db, 'partida', 'estat', 'respostes', jugadorDocId),
      { nom, resposta: idx, punts, timestamp: serverTimestamp() }
    );
    // Actualitza puntuació acumulada al jugador
    await setDoc(
      doc(db, 'partida', 'estat', 'jugadors', jugadorDocId),
      { nom, punts: increment(punts) },
      { merge: true }
    );
    mostrarEsperant(idx);
  } catch(e) {
    console.error(e);
  }
};

function mostrarEsperant(idx) {
  document.getElementById('esperant-lletra').textContent = 'ABCD'[idx ?? 0];
  mostrarScreen('screen-esperant');
}

// ── Resultats ─────────────────────────────────────────────────────────
async function mostrarResultatsUsuari() {
  clearInterval(timerInterval);
  const idx = partida.preguntaIndex ?? 0;
  const p   = preguntes[idx];
  if (!p) return;

  // Comprova si ha respost correctament
  try {
    const resDoc = await getDoc(doc(db, 'partida', 'estat', 'respostes', jugadorDocId));
    if (resDoc.exists()) {
      const resp = resDoc.data();
      const encertat = resp.resposta === p.correcta;
      document.getElementById('res-icon').textContent   = encertat ? '🎉' : '😅';
      document.getElementById('res-titol').textContent  = encertat ? 'Correcte!' : 'Incorrecte';
      document.getElementById('res-correcta-text').textContent = `La resposta era: ${p.respostes[p.correcta]}`;
      if (encertat) {
        document.getElementById('res-punts-wrap').style.display = 'block';
        document.getElementById('res-punts').textContent = `+${resp.punts}`;
      } else {
        document.getElementById('res-punts-wrap').style.display = 'none';
      }
    } else {
      document.getElementById('res-icon').textContent  = '⏱️';
      document.getElementById('res-titol').textContent = 'No has respost a temps';
      document.getElementById('res-correcta-text').textContent = `La resposta era: ${p.respostes[p.correcta]}`;
      document.getElementById('res-punts-wrap').style.display = 'none';
    }
  } catch(e) { console.error(e); }

  // Puntuació total
  try {
    const jugDoc = await getDoc(doc(db, 'partida', 'estat', 'jugadors', jugadorDocId));
    if (jugDoc.exists()) {
      document.getElementById('res-total-punts').textContent = `Total: ${jugDoc.data().punts} pts`;
    }
  } catch(e) {}

  mostrarScreen('screen-resultats');
}

// ── Final ─────────────────────────────────────────────────────────────
async function mostrarFinalUsuari() {
  clearInterval(timerInterval);
  try {
    const jugDoc = await getDoc(doc(db, 'partida', 'estat', 'jugadors', jugadorDocId));
    if (jugDoc.exists()) {
      document.getElementById('final-punts').textContent = jugDoc.data().punts;
    }
  } catch(e) {}
  document.getElementById('final-nom').textContent = nom;
  mostrarScreen('screen-final');
}

// ── Utils ─────────────────────────────────────────────────────────────
function mostrarScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}
