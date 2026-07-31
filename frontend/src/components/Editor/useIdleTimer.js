import {useEffect, useRef} from "react";
import {ACTIVITY_EVENTS} from "../../activityEvents";

/* A szerkesztők autosave-e ennyi TÉTLENSÉG után sül el.

   SZÁNDÉKOSAN kevesebb, mint az auth 15 perces tétlenségi kijelentkezése
   (contexts/auth.jsx: IDLE_LIMIT_MS): így az otthagyott, mentetlen munka még
   ÉRVÉNYES tokennel elmentődik, mielőtt a session lejár. Fontos: a mentés utáni
   navigáció NEM aktivitás és NEM hív /refresh-t, tehát ez a 15 perces órát NEM
   indítja újra — a tétlenségi kijelentkezés a menetrend szerint (a valódi utolsó
   aktivitástól) következik be. A két érték együtt módosítandó. */
const AUTOSAVE_IDLE_MS = 10 * 60 * 1000;

/* Tétlenség-óra: `delayMs` aktivitás nélkül eltelt idő után meghívja az `onIdle`
   függvényt. MINDEN aktivitás újraindítja, tehát gépelés közben sosem sül el.
   Csak a hívó komponens életére szól (mount → unmount).

   Az `onIdle`-t refben tartjuk, és minden renderben frissítjük. Ez azért kell,
   mert az óra EGYSZER indul (üres deps), a callback viszont a szerkesztő
   állapotát olvassa — ref nélkül az első render elavult értékeit mentené el. Így
   a hívó egyszerűen egy friss closure-t ad át, és nem kell ismernie a trükköt. */
export function useIdleTimer(onIdle, delayMs = AUTOSAVE_IDLE_MS) {
    const onIdleRef = useRef(onIdle);
    onIdleRef.current = onIdle;

    useEffect(() => {
        let timer = setTimeout(() => onIdleRef.current(), delayMs);
        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(() => onIdleRef.current(), delayMs);
        };
        ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, reset, {passive: true}));
        return () => {
            clearTimeout(timer);
            ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, reset));
        };
    }, [delayMs]);
}
