import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import type {CSSProperties, ReactNode} from "react";
import type {Id} from "../../../types/api";

/* Egy húzható kártya a főoldalon.

   A húzó-fogantyú maga a KÁRTYA: a listeners az egész dobozra kerül, nem egy
   külön markoló ikonra. A kattintás (ami a szerkesztőt nyitja) és a húzás
   szétválasztását két dolog intézi, MINDKETTŐ a read.jsx-ben: az érzékelők
   aktiválási feltételei, és a húzás utáni kattintás elnyelése — utóbbi a
   dokumentumon ül, mert a dnd-kit már a rács fölött megállítja az eseményt (az
   indoklás ott van, a kezelőnél). */
export default function SortableCard({id, children}: {id: Id; children: ReactNode}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id});

    /* A típus KIMONDVA, nem a `style` propból visszakövetkeztetve: így egy
       elgépelt CSS-tulajdonság már itt, a definíciónál kiderül. */
    const style: CSSProperties = {
        /* CSS.Translate, NEM CSS.Transform — a különbség látszik a képernyőn.

           A rendezési stratégia nem csak eltolást ad a kártyáknak, hanem
           NYÚJTÁSI arányt is (scaleX/scaleY: az új és a régi hely méretének
           hányadosa). A mi kártyáink KÜLÖNBÖZŐ magasak — annyi listaelem van
           rajtuk, amennyit írtál —, tehát ez az arány nem 1. A CSS.Transform
           kirakná a scale-t is, ami az EGÉSZ elemet nyújtja: a szegélyt, a
           térközöket és a betűket egyaránt. Húzás közben ettől "gumiztak" a
           kártyák, amiken a húzott áthaladt.

           A CSS.Translate csak az eltolást írja ki, a nyújtást eldobja. Ára:
           eltérő magasságú elemeknél a helycsere-animáció kevésbé pontosan
           előlegezi meg a végállapotot — de az sokkal kevésbé zavaró, mint a
           torzuló szöveg. */
        transform: CSS.Translate.toString(transform),
        transition,
        // A húzott kártya a többi FÖLÉ kerüljön, különben a szomszédok alá bújna.
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.85 : undefined,
        /* Itt SZÁNDÉKOSAN nincs touch-action.

           Állt itt egy "touchAction: isDragging ? none : undefined", de az nem
           tudott dolgozni: a touch-action-t a böngésző a gesztus KEZDETÉN
           olvassa ki, az isDragging viszont csak közben igaz — mire beállítottuk
           volna, a böngésző már eldöntötte, görget-e.

           Az ujjal görgetést valójában a dnd-kit TouchSensora tartja vissza:
           nem-passzív touchmove-figyelőt tesz fel, hogy a preventDefault hasson
           (a saját kommentjük szerint ez iOS Safarihoz kell). A könyvtár
           touch-action: none-ja pedig a DragOverlay-hez tartozik, amit mi nem
           használunk — a kártya a helyén marad, eltolással mozog.

           A sor elhagyása valódi telefonon ellenőrizve (2026-07-17): a kártyán
           simítva a lap görög és a kártya nem mozdul; kitartás után a kártya jön
           az ujjal, a lap pedig nem görög közben. */
    };

    /* Itt SZÁNDÉKOSAN nincs függőleges margó (se my-*, se mb-*).
       A kártyasorok közti térközt a rács row-gapje adja (index.css: .todo-grid),
       mert az CSAK a sorok KÖZÉ tesz helyet: az utolsó sor alá nem. Margóval ez
       nem érhető el — a `.row` flex-konténer, ott a margók nem omlanak össze (a
       my-* dupla térközt adna), a csak-alsó mb-* pedig az utolsó sor alá is
       kitenne egy térközt, amit onnan nem lehet levenni (nincs "utolsó sor"
       szelektor). Vízszintesen marad a px-2: azt a gap nem érinti. */
    return (
        <div ref={setNodeRef} style={style} className="col-12 col-sm-6 col-xl-4 col-xxl-3 px-2"
             {...attributes} {...listeners}>
            {children}
        </div>
    );
}
