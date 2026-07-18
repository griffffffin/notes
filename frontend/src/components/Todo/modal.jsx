import {useEffect, useRef} from "react";
import SubmitButton from "../Button/submitButton";

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
export default function Modal(props) {
    const dialogRef = useRef(null);

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
               az első fókuszálható elemre (a bezáró X) tenné. */
            dialog.querySelector(".modal-body button")?.focus();
        } else if (!props.isShow && dialog.open) dialog.close();
    }, [props.isShow]);

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
    const handleDialogClick = (event) => {
        if (event.target === dialogRef.current) props.handleClose();
    };

    return (
        <dialog ref={dialogRef} className="todo-modal" onClose={handleClose} onClick={handleDialogClick}>
            <div className={"modal-content border border-3 border-" + props.color + " bg-theme-page text-" + props.color}>
                <div className="modal-header text-center ms-1 py-2 border-0">
                    <h5 className="modal-title text-center m-0">Törlés</h5>
                    {/* A bezáró X-et magunk rendereljük, eleve a to-do színével —
                        így elmarad a régi, elemre utólag rátett osztály (DOM-kotrás
                        a render után), ami a react-bootstrap closeButton-t színezte. */}
                    <button type="button" aria-label="Bezárás" onClick={handleClose}
                            className={"btn-close text-" + props.color}/>
                </div>
                <div className="modal-body pt-0">
                    <div className="ms-2 pb-3">Biztosan törlöd?</div>
                    <div className="d-grid">
                        <SubmitButton type="button" onClick={handleClose} isOutline={false} color={props.color}
                                      isDisabled={false} text="Vissza"/>
                        <SubmitButton type="button" onClick={props.handleDelete} isOutline={false} color="danger"
                                      isDisabled={false} text="Törlés"/>
                    </div>
                </div>
            </div>
        </dialog>
    );
}
