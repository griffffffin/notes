import {useCallback, useSyncExternalStore} from "react";

/* EGYSZERRE EGY TOOLTIP lehet nyitva az egész lapon.

   Miért kell ehhez külön nyilvántartás? Mert a react-tooltip minden buborékja
   önállóan él: nem tudnak egymásról, tehát a hibabuborék nyugodtan ott maradhat,
   miközben a sorszám-léptető súgója is felnyílik — két buborék takarja egymást és
   a szerkesztőt. A "csak egy" szabály nem egy komponens ügye, hanem a LAPÉ, ezért
   a nyitott tooltip azonosítója itt, egyetlen modulszintű értékben él.

   Miért nem React-context? Mert a contexthez az egész appot körbe kellene fogni
   egy újabb providerrel, holott itt egyetlen apró érték változik, és minden
   tooltip UGYANAZT az egy értéket nézi. A React erre ad kész eszközt:
   a useSyncExternalStore egy React-en KÍVÜLI tárolóra iratkozik fel, és
   újrarajzolja azt a komponenst, amelyik figyeli. Cserébe a tároló modulszintű
   (globális) állapot — ezért a tesztek a resetTooltips()-szal állítják alaphelyzetbe,
   nehogy az egyik teszt nyitva hagyott buborékja átszivárogjon a következőbe. */

/* A típus KIMONDOTTAN `string | null`, nem csak `null`-ból következtetve: e nélkül
   a fordító a kezdőértékből azt hinné, hogy ez a változó örökre null marad, és a
   nyitáskori értékadást hibának venné. Ez a "szűk kezdőérték" csapdája — az egyik
   leggyakoribb első TypeScript-meglepetés. */
let openId: string | null = null;
const listeners = new Set<() => void>();

const emit = () => {
    for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/* Melyik tooltip van nyitva (vagy null). A komponensek a lenti hookot használják;
   ez a getter a useSyncExternalStore snapshot-forrása. (Korábban exportált is volt a
   navbar-kereső tesztjeinek — az a kereső az E2EE-vel megszűnt, így már csak belül kell.) */
const getOpenTooltipId = (): string | null => openId;

/* Egy tooltip nyitása/zárása. Nyitáskor a korábban nyitott MAGÁTÓL becsukódik
   (az érték csak egy azonosítót tud tárolni). Záráskor csak akkor nullázunk, ha
   tényleg a hívó volt nyitva — különben egy távozó buborék becsukná az épp
   megnyílt másikat (a react-tooltip a "bezárás" eseményét késleltetve is küldheti). */
export function setTooltipOpen(id: string, isOpen: boolean): void {
    const next = isOpen ? id : (openId === id ? null : openId);
    if (next === openId) return;
    openId = next;
    emit();
}

// Nyitva van-e ÉPPEN ez a tooltip? A komponens ebből kapja az isOpen propját.
export function useTooltipOpen(id: string): boolean {
    return useSyncExternalStore(subscribe, getOpenTooltipId) === id;
}

/* A react-tooltip `setIsOpen` propjához illő, STABIL függvény: a könyvtár saját
   nyitó/záró eseményei (hover, fókusz, egérelhagyás) ezen át jutnak el a
   nyilvántartáshoz. Stabil, mert a react-tooltip a prop változására újraköti a
   figyelőit. */
export function useTooltipToggle(id: string) {
    return useCallback((isOpen: boolean) => setTooltipOpen(id, isOpen), [id]);
}

// Csak tesztekhez: a modulszintű állapot alaphelyzetbe.
export function resetTooltips(): void {
    openId = null;
    emit();
}
