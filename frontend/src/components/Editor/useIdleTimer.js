import {useEffect, useRef} from "react";
import {ACTIVITY_EVENTS, AUTOSAVE_IDLE_MS} from "../../idle";

/* Az alapértelmezett késleltetés (AUTOSAVE_IDLE_MS) és a kijelentkezéshez való
   viszonya az idle.js-ben van, a másik órával egy helyen — a kettő csak együtt
   értelmezhető. Amit itt érdemes tudni: a mentés utáni navigáció NEM aktivitás
   és NEM hív /refresh-t, tehát ez az óra a 15 perces kijelentkezést NEM tolja el;
   az a valódi utolsó aktivitástól számítva jár le.

   Tétlenség-óra: `delayMs` aktivitás nélkül eltelt idő után meghívja az `onIdle`
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
