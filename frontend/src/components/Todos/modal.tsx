import {useEffect, useRef} from "react";
import SubmitButton from "../Button/submitButton";
import type {MouseEvent, SyntheticEvent} from "react";
import type {BootstrapColor} from "../../contexts/theme-context";

/* A szín kétféle lehet, mert a modal két szerkesztőt szolgál ki: a to-do a saját
   paletta-színét adja, az idézet a témáét (l. deleteAndModal). */
export type ModalProps = {
    isShow: boolean;
    handleClose: () => void;
    handleDelete: () => void;
    color: BootstrapColor;
    /* A törlés FOLYAMATBAN van (a kérés elindult, a válasz még nem jött meg). A
       gomb ilyenkor letiltva, "Törlés…" felirattal: enélkül a dialógus azonnal
       bezárult, és a felhasználó nem tudta, elindult-e egyáltalán a művelet. */
    isDeleting: boolean;
    /* A törlés ELBUKOTT. A dialógus nyitva marad, és megmondja — eddig némán
       bezárult, mintha mi sem történt volna (l. failure-looks-like-normal audit). */
    deleteFailed: boolean;
};

/* Törlés-megerősítő dialógus a natív <dialog> elemre építve (a react-bootstrap
   Modal helyett — azt az egész @restart/ui + dom-helpers + react-transition-group
   függőség-láncot váltottuk ki egyetlen dialógusért).

   A showModal() ingyen adja, amiért a könyvtárat tartottuk: fókusz-csapdát (a Tab
   a dialóguson belül marad), ESC-bezárást, backdrop-ot, és a top-layer renderelést
   — utóbbi a legfelső rétegbe teszi az ablakot, így nincs z-index-harc (amiből a
   projektben volt épp elég).

   A <dialog> csak a pozíció/backdrop hordozója; a látható dobozt a belső
   .modal-content viseli — ugyanaz a szerkezet, amit a react-bootstrap generált,
   így a rá hangolt index.css-szabályok (.modal-content/-header/-body/-title,
   .btn-close) mind változatlanul érvényesek. */
/* A megerősítő gomb azonosítója. Konstans, mert két helyen kell (a gombon és a
   fókuszálásnál) — és mert a SZÍN-osztály nem alkalmas horgonynak: a Vissza gomb
   ugyanazt a `btn-danger`-t viselheti, ha a szerkesztett to-do színe piros.
   MÉRVE (2026-08-19): a szín-alapú szelektorral a fókusz a Visszán maradt. */
const DELETE_BUTTON_ID = "deleteConfirmButton";

export default function Modal(props: ModalProps) {
    /* A típus KIMONDVA, nem a `null` kezdőértékből következtetve — különben a
       fordító örökre `null`-ra szűkítené a refet, és a `dialog.showModal()` sor
       le sem fordulna. */
    const dialogRef = useRef<HTMLDialogElement>(null);

    /* Az isShow prop vezérli a natív dialógust. A dialog.open guard a fölösleges
       dupla-hívást előzi: ha az ESC vagy a backdrop már bezárta, a rákövetkező
       isShow=false effekt nem hív még egy close()-t (és fordítva). */
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (props.isShow && !dialog.open) {
            dialog.showModal();
            /* A biztonságos gombra (Vissza, a body első gombja) tesszük a fókuszt,
               nem a Törlésre — így egy véletlen Enter nem töröl. A showModal alapból
               az első fókuszálható elemre (a bezáró X) tenné.

               A querySelector `Element`-et ad vissza, azon pedig nincs focus().
               NEM `querySelector<HTMLButtonElement>`-tel és nem `as`-szal oldjuk
               meg: az csak ÁLLÍTANÁ az alakot, ellenőrizni nem ellenőrizné (l.
               CLAUDE.md). Az `instanceof` valódi futásidejű vizsgálat — ha a
               szelektor egyszer mást talál (vagy semmit), itt csendben elmarad a
               fókusz, ahogy eddig is az `?.` mellett. */
            const safeButton = dialog.querySelector(".modal-body button");
            if (safeButton instanceof HTMLElement) safeButton.focus();
        } else if (!props.isShow && dialog.open) dialog.close();
    }, [props.isShow]);

    /* A BUKÁS UTÁN A TÖRLÉS GOMBRA KERÜL A FÓKUSZ.

       Megnyitáskor a biztonságos gomb (Vissza) kapja meg, hogy egy véletlen Enter
       ne töröljön — ott a felhasználó még csak most kérdez rá. A HIBA UTÁN viszont
       már döntött: törölni akart, és a művelet bukott el. Ilyenkor a következő
       lépése majdnem biztosan az újrapróbálás, tehát az legyen kéznél: egy Enter
       elég hozzá.

       A `querySelector` `Element`-et ad, azon nincs `focus()`; az `instanceof` a
       valódi vizsgálat (ugyanaz, mint a megnyitásnál).

       AZ EFFEKT SORRENDJE SZÁMÍT: a megnyitás-effekt UTÁN áll, mert az a
       biztonságos gombra teszi a fókuszt. Ha egy dialógus egyszerre nyílna meg és
       lenne hibás állapotban (a tesztben ez előfordul), a később futó effekt nyer
       — és ilyenkor a helyes a Törlés gomb. */
    useEffect(() => {
        if (!props.deleteFailed) return;
        const retry = dialogRef.current?.querySelector("#" + DELETE_BUTTON_ID);
        if (retry instanceof HTMLElement) retry.focus();
    }, [props.deleteFailed]);

    /* Unmount-biztonság. Ha a szülő úgy tűnik el, hogy a dialógus még nyitva van
       — jellemzően a törlés UTÁNi navigáció: a DeleteAndModal a szerkesztővel
       együtt unmountol —, a natív close() nélkül a nyitott <dialog> OTTRAGADNA a
       böngésző top-layerében: látszana a következő oldalon (a "szellem-modal"),
       és elnyelné a kattintásokat, örök töltést okozva. A close() kiveszi a
       top-layerből. Üres függőség: ez CSAK unmountkor fut. */
    useEffect(() => {
        // A dialógust MOST kapjuk el, nem a cleanupban: unmountkor a React a
        // dialogRef.current-et már kinullázhatta, mire a cleanup futna.
        const dialog = dialogRef.current;
        return () => {
            if (dialog?.open) dialog.close();
        };
    }, []);

    /* A natív bezárások (ESC, close()) visszajeleznek a szülőnek, hogy az isShow
       állapota szinkronban maradjon a dialóguséval — különben a dialógus zárva
       lenne, de a szülő még nyitottnak hinné, és nem lehetne újranyitni. */
    const handleClose = () => props.handleClose();

    /* Backdrop-kattintás zárás: a ::backdrop-ra eső kattintás célpontja maga a
       <dialog> (a belső .modal-content elnyeli a rá esőt), így a tartalmon KÍVÜLI
       kattintás zár — pontosan úgy, ahogy a react-bootstrap is tette. */
    const handleDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
        /* TÖRLÉS KÖZBEN NINCS KIÚT. A művelet fut, megszakítani nem tudjuk —
           ugyanaz az érv, amiért a "Vissza" gomb is eltűnik ilyenkor: hazug
           ígéret volna. A kattintás így egyszerűen nem csinál semmit; a dialógus
           modális, tehát a mögötte lévő felület (kijelentkezés, navbar) sem
           elérhető, amíg nyitva van. */
        if (props.isDeleting) return;
        if (event.target === dialogRef.current) props.handleClose();
    };

    /* AZ ESC IS ZÁRVA. A natív <dialog> "cancel" eseménye a bezárás ELŐTT szól, és
       megelőzhető — enélkül az ESC kiengedne a folyamatban lévő törlésből, és a
       felhasználó a navbaron (pl. kijelentkezéssel) félbeszakíthatná a műveletet. */
    const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
        if (props.isDeleting) event.preventDefault();
    };

    return (
        <dialog ref={dialogRef} className="todo-modal" onClose={handleClose} onClick={handleDialogClick}
                onCancel={handleCancel}>
            <div className={"modal-content border border-3 border-" + props.color + " bg-theme-page text-" + props.color}>
                <div className="modal-header ms-1 py-2 border-0">
                    {/* A FOLYAMATBAN-állapot a FEJLÉCBEN jelenik meg ("Törlés…"), és a
                        törzs ilyenkor eltűnik: nincs kérdés, amire válaszolni kell,
                        és nincs gomb, amit meg lehetne nyomni. Így a dialógus a
                        művelet idejére egyetlen sorrá zsugorodik — maga a méret is
                        jelzés. A kérdés és a hibaüzenet marad a törzsben.

                        A CÍM BALRA ÁLL, mindkét állapotban. Nem `text-center`-rel:
                        a `.modal-header` flex-doboz (`justify-content: space-between`),
                        amiben a cím a saját szélességére zsugorodik — ott a
                        szövegigazítás semmit nem csinál. A régi `text-center`
                        osztályok pont ezért kerültek le a fejlécről és a címről:
                        azt ígérték, hogy középre igazítanak, közben a bal oldali
                        helyzetet a flex-elrendezés adta (mérve, 2026-08-19). */}
                    <h5 className="modal-title m-0">
                        {props.isDeleting ? "Törlés…" : "Törlés"}
                    </h5>
                    {/* A bezáró X-et magunk rendereljük, eleve a to-do színével —
                        így elmarad a régi, elemre utólag rátett osztály (DOM-kotrás
                        a render után), ami a react-bootstrap closeButton-t színezte.

                        TÖRLÉS KÖZBEN NINCS OTT. Nem tiltott gombként, hanem sehogy: egy
                        jól látható, de halott X pont az a "kattinthatónak látszik,
                        közben néma" vezérlő, amit ez az app máshol is kerül. Ha nincs
                        mit tenni, ne is kínáljunk gombot — a dialógus ilyenkor egyetlen
                        sorrá zsugorodik, és maga a méret a jelzés.

                        Következménye, amire külön ügyelni kell: a törzs ilyenkor
                        szintén nincs kirajzolva, tehát X nélkül NULLA fókuszálható elem
                        marad a dialógusban. A böngésző ilyenkor magára a <dialog>-ra
                        teszi a fókuszt, és kirajzolja köré a saját fókuszgyűrűjét —
                        ezt az index.css oltja ki (mérve headless renderrel). */}
                    {!props.isDeleting &&
                        <button type="button" aria-label="Bezárás" onClick={handleClose}
                                className={"btn-close text-" + props.color}/>}
                </div>
                {/* Törlés közben NINCS törzs. A `modal-body` saját (1rem) alsó
                    paddingje enélkül aszimmetrikus térközt hagyna a fejléc alatt —
                    a fejléc `py-2`-je így felül-alul egyformán tartja a címet. */}
                {!props.isDeleting && <div className="modal-body pt-0">
                    {/* EGY SOR, HÁROM ÁLLAPOT — ugyanazon a helyen, azonos betűvel
                        és vastagsággal. A dialógusnak egyszerre egy mondanivalója
                        van: kérdez, dolgozik, vagy jelent. Külön hibasor a kérdés
                        MELLETT azt sugallná, hogy még mindig a megerősítésre
                        várunk, közben pedig már válasz érkezett.

                        A `role="alert"` csak a hiba-állapotban van rajta: a
                        képernyőolvasó így a felbukkanó üzenetet azonnal
                        felolvassa, a kérdést viszont nem riasztásként hallja. */}
                    <div className="ms-2 pb-3" role={props.deleteFailed ? "alert" : undefined}>
                        {props.deleteFailed ? "A törlés nem sikerült!" : "Biztosan törlöd?"}
                    </div>
                    <div className="d-grid">
                        <SubmitButton type="button" onClick={handleClose} isOutline={false}
                                      color={props.color} isDisabled={false} text="Vissza"/>
                        {/* A TÖRLÉS GOMB HIBA UTÁN IS KELL: a bukás oka jellemzően
                            múló (hálózati zökkenő, épp újrainduló szerver, lejárt
                            token), tehát a második próbálkozás valóban sikerülhet. */}
                        <SubmitButton id={DELETE_BUTTON_ID} type="button" onClick={props.handleDelete}
                                      isOutline={false} color="danger" isDisabled={false} text="Törlés"/>
                    </div>
                </div>}
            </div>
        </dialog>
    );
}
