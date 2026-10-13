import confetti from "canvas-confetti";

const PHRASES = [
  "🎇 PARABÉNS, VOCÊ É BRILHANTE! 🥂🦅",
  "🎇 PARABÉNS, VOCÊ É INCRÍVEL! 🥂🦅",
  "🔥 VOCÊ DEU SHOW NESSA VENDA!",
  "🦅 MAIS UMA CONQUISTA DE UM BRILHANTE!",
  "🚀 VENDA FECHADA! VAMOS PARA A PRÓXIMA!",
  "🏆 VOCÊ ESTÁ FAZENDO HISTÓRIA!",
  "💥 MAIS UMA VENDA PARA A CONTA!",
  "🥂 ESSA MERECE UM BRINDE!",
  "🎯 META MAIS PERTO!",
  "👏 PARABÉNS! VOCÊ MANDOU MUITO BEM!",
];

export const randomPhrase = () => PHRASES[Math.floor(Math.random() * PHRASES.length)];
export const soundEnabled = () => localStorage.getItem("celebrate_sound") !== "off";
export const setSoundEnabled = (v) => localStorage.setItem("celebrate_sound", v ? "on" : "off");

function playSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "triangle"; o.frequency.value = f;
      const t = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.start(t); o.stop(t + 0.24);
    });
  } catch (e) { /* ignore */ }
}

export function celebrate() {
  const colors = ["#D4AF37", "#1F8A4C", "#ffffff", "#e8c766"];
  confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 }, colors });
  const end = Date.now() + 700;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  if (soundEnabled()) playSound();
}
