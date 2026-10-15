/* core/handles.js — losowe ksywy nowych graczy (czyste dane + wybór; zero DOM).
 * F6b (U10, R-U10 „tryb rodzinny"): ksywa jest nadawana AUTOMATYCZNIE (także w meczu rodzinnym/firmowym),
 * więc domyślna pula jest NEUTRALNA — zabawna, bez wulgaryzmów, podtekstów seksualnych, wyśmiewania
 * wyglądu i żartów religijnych. Pikantne ksywy tylko po włączeniu „Pikantne ksywy" w menu (opt-in). */

export const NEUTRAL_HANDLES = [
  'Michał Dżemson','Darth Wiesław','Obi-Wan Kebabi','James Bonczur','Indiana Janusz','James Bondżur',
  'Gandalf Biały Ser','Spider-Chłop','Batman z Biedry','Hulk po Kompocie','Rocky Balbochen','John Wycisk',
  'Robert Lewa Noga','Krzysztof Kieślina','Pudzilla','Pan Kleksik','Pirat z Karaibiedronki','Ojciec Chrzestny Karpia',
  'Cristiano Rolando','Lionel Messiasty','Kanye Westchnienie','Snoop Pies','Post Malonez','Temu Batman',
  'Taco z Paczkomatu','Betonowy Mnich','Kulturalny Chuligan','Młody Janusz','Szczur z otwarcia kanału',
  'Książę Pasztetu','Szef Parówek','Drugi Peja','Mądrzejszy Einstein','Zimny Kaloryfer','Zaginiony Teść',
  'Wujek Chaos','Pół Człowiek Pół Główek','Grzybiarz Olek','Emerytka','Shrek po Krecie','Messi z Temu',
  'Hari Pota','Geralt z Niedrzwicy','Kapitan Oczywisty','Minionek Alfa','Naczelny Słoik','Mistrz Ceraty',
  'Głuchy Pień','Mała Ale Ja Już','Bober z Grzywką',
  // F6b: dopełnienie puli neutralnej (po wydzieleniu pikantnych)
  'Kapitan Refren','Lady Gagatek','Pan Winylowy','Elvis z Osiedla','Freddie z Parteru','Dziadek z Gramofonem',
];
export const SPICY_HANDLES = [
  'Analny Korsarz','Bruce Wilgotny','Dua Cipa','Mokra Włoszka','Łóżkowy Sprinter','Tłusty Ninja',
  'Jan Router II','Wiesław Wszechmogący','Szybki Proboszcz',
];

const SPICY_SET = new Set(SPICY_HANDLES);
export function isSpicyHandle(h){ return typeof h==='string' && SPICY_SET.has(h.trim()); }

// losowa ksywa: domyślnie z puli neutralnej; spicy=true → neutralne ∪ pikantne
export function pickHandle({ spicy = false, rnd = Math.random } = {}){
  const pool = spicy ? NEUTRAL_HANDLES.concat(SPICY_HANDLES) : NEUTRAL_HANDLES;
  return pool[Math.min(pool.length-1, Math.floor(rnd()*pool.length))];
}
