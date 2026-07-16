import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";

/* Egy húzható kártya a főoldalon.

   A húzó-fogantyú maga a KÁRTYA: a listeners az egész dobozra kerül, nem egy
   külön markoló ikonra. A kattintás (ami a szerkesztőt nyitja) és a húzás
   szétválasztását két dolog intézi, MINDKETTŐ a read.jsx-ben: az érzékelők
   aktiválási feltételei, és a húzás utáni kattintás elnyelése.

   A kattintás-elnyelés SZÁNDÉKOSAN nem itt van, hanem a rácson: a felengedéskor
   érkező kattintás nem feltétlenül azon a kártyán landol, amit húztunk — a
   szomszédjára is eshet, attól függően, merre mozdult a lista. Kártyánkénti
   jelzővel a szomszéd átengedte volna, mert ő maga nem volt húzva. */
export default function SortableCard({id, children}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id});

    const style = {
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
        /* touchAction: none húzás közben — enélkül a böngésző a saját
           görgetésének tekintené az ujjmozgást, és elvenné az eseményt a húzás
           elől. Csak amíg húzunk, különben a kártyán soha nem lehetne görgetni. */
        touchAction: isDragging ? "none" : undefined,
    };

    return (
        <div ref={setNodeRef} style={style} className="col-12 col-sm-6 col-xl-4 col-xxl-3 px-2 my-3"
             {...attributes} {...listeners}>
            {children}
        </div>
    );
}
