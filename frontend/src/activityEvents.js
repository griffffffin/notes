/* "A felhasználó a gép előtt van" — az események, amikből ezt megállapítjuk.

   KÉT független óra épül rá, és SZÁNDÉKOSAN ugyanabból a halmazból dolgoznak:
     • a tétlenségi KIJELENTKEZÉS (contexts/auth.jsx, 15 perc), és
     • a szerkesztők AUTOSAVE-je (components/Editor/useIdleTimer.js, 10 perc).
   Ha a két lista eltérne, az autosave elsülhetne olyankor, amikor a felhasználó
   valójában aktív (vagy fordítva, elmaradhatna, amikor tényleg elsétált) — a két
   határidő egymásra épül, tehát ugyanazt kell mérniük. Korábban a lista két
   helyen volt leírva, kommentekkel összekötve; ez a kézi szinkron szűnt meg itt.

   A figyelőket mindig `{passive: true}`-val kell felkötni: ez azt ígéri a
   böngészőnek, hogy nem akadályozzuk meg az alapértelmezett viselkedést —
   enélkül minden görgetésnél meg kellene várnia a kódunkat, ami akadozást okoz. */
export const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
