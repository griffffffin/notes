import {useState} from "react";
import {useNavigate} from "react-router-dom";
import Modal from "./modal";
import {useAuth} from "../../contexts/auth-context";
import {logRequestError} from "../../log";
import {responseStatus} from "../../httpError";
import {ENDPOINTS} from "../../endpoints";
import type {Endpoint} from "../../endpoints";
import type {Id} from "../../types/api";
import type {BootstrapColor} from "../../contexts/theme-context";
import {PATHS} from "../../paths";

/* A KÖTELEZŐ mezők azok, amiket mindkét szerkesztő ad; minden más opcionális,
   mert vagy csak a to-dónak, vagy csak az idézetnek van értelme. Az `itemId` és a
   `todoId` kettőssége öröklés: a to-do a régi nevet adja, az idézet az általánosat
   (l. az alábbi ?? láncot). */
type DeleteAndModalProps = {
    handleLinkClicked: () => void;
    color: BootstrapColor;
    /* A `deleteUrl` VÉGPONT (a szervernek szól), a `listUrl` NAVIGÁCIÓS út (a
       böngésző címe a törlés után) — a két fogalom szándékosan külön típusú, hogy
       ne lehessen összecserélni őket (l. endpoints.ts). */
    deleteUrl?: Endpoint;
    listUrl?: string;
    /* Az azonosító az URL-ből jön, ezért `undefined` is lehet; a gomb viszont csak
       szerkesztés (update) közben jelenik meg, ahol az útvonal kötelezővé teszi. */
    itemId?: Id | null | undefined;
    todoId?: Id | null | undefined;
    setIsCategoryClicked?: (isClicked: boolean) => void;
    setIsColorClicked?: (isClicked: boolean) => void;
    handleCategoryChange?: () => void;
    onDelete?: () => void;
    /* Le van-e tiltva a Törlés gomb. A szerkesztő MENTÉS KÖZBEN állítja igazra:
       különben el lehetne törölni egy elemet, miközben ugyanannak a mentése épp
       úton van a szerver felé. Opcionális, mert az idézet-szerkesztő is ezt a
       komponenst használja. */
    isDisabled?: boolean;
};

export default function DeleteAndModal(props: DeleteAndModalProps) {
    const [isModalShow, setIsModalShow] = useState(false);
    /* A törlés FOLYAMATBAN / ELBUKOTT állapota. Eddig egyik sem létezett: a
       dialógus a kattintás pillanatában bezárult, a kérés pedig a háttérben
       elszállhatott — a felhasználó azt látta, hogy semmi nem történik, és nem
       tudta eldönteni, törölt-e vagy sem. */
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteFailed, setDeleteFailed] = useState(false);
    const navigate = useNavigate();
    const {handleAxios} = useAuth();

    /* A törlés-modal két szerkesztőt szolgál ki. A to-do a todoId-t adja, plusz a
       navbar-szűrők zárását és a kategória-lista frissítését; az idézetnek csak a
       saját törlő-végpontja és listája van. A defaultok a to-dóra állnak (hogy az
       ő hívása ne változzon), a to-do-specifikus callbackek pedig opcionálisak. */
    const deleteUrl = props.deleteUrl ?? ENDPOINTS.todoDelete;
    const listUrl = props.listUrl ?? PATHS.todos;
    const itemId = props.itemId ?? props.todoId;

    /* Nincs useCallback: ezek onClick-ekre mennek, memózatlan komponensekre. */
    const handleModalShow = () => {
        props.handleLinkClicked();
        props.setIsCategoryClicked?.(false);
        props.setIsColorClicked?.(false);
        // Új nekifutás: az előző kudarc üzenete ne köszönjön vissza.
        setDeleteFailed(false);
        setIsModalShow(true);
    };

    const handleModalClose = () => {
        setIsModalShow(false);
        setDeleteFailed(false);
    };

    const handleDelete = () => {
        /* A DIALÓGUS NYITVA MARAD a válaszig. Korábban azonnal bezárult, tehát a
           sikeres és a sikertelen törlés PONTOSAN ugyanúgy nézett ki: a modal
           eltűnt, és vagy megtörtént a művelet, vagy nem. Most a gomb letiltva
           várakozik ("Törlés…"), és a válasz dönti el, mi látszik. */
        setIsDeleting(true);
        setDeleteFailed(false);
        handleAxios(deleteUrl, {id: itemId}, (response) => {
            setIsDeleting(false);
            if (response.status !== 200) { setDeleteFailed(true); return; }
            /* A SIKER ágán szólunk a szerkesztőnek (onDelete): innentől nem
               mentheti vissza a már törölt elemet a leváláskori mentése.

               SZÁNDÉKOSAN csak itt, nem a kérés előtt: korábban a jelzés a kérés
               INDÍTÁSAKOR ment el, tehát egy elbukott törlés után a szerkesztő
               úgy maradt ott, hogy a leváláskori mentése le van tiltva — a
               felhasználó ezután beírt szövege némán elveszett volna. */
            props.onDelete?.();
            setIsModalShow(false);
            props.handleCategoryChange?.();
            // Törlés után a saját listára megyünk: a szerkesztett elem megszűnt.
            void navigate(listUrl);
        }, (error) => {
            setIsDeleting(false);
            logRequestError(error);
            /* A 403 ITT AZT JELENTI: "nálad nincs ilyen elem". A szerver
               SZÁNDÉKOSAN nem különbözteti meg a nem létezőt az idegentől (l.
               backend/src/ownership.js) — így nem árulja el, létezik-e egy
               azonosító. A szerkesztőt viszont csak a SAJÁT elemeidre lehet
               megnyitni, tehát a gyakorlatban ez az eset azt jelenti, hogy az
               elem időközben megszűnt (pl. másik eszközön törölted).

               Ilyenkor a törlés CÉLJA teljesült: nincs mit törölni. Hibát
               kiírni és Törlés gombot kínálni félrevezető lenne (a következő
               próbálkozás is 403-at kapna) — ugyanoda megyünk, mint sikernél. */
            if (responseStatus(error) === 403) {
                props.onDelete?.();
                setIsModalShow(false);
                props.handleCategoryChange?.();
                void navigate(listUrl);
                return;
            }
            setDeleteFailed(true);
        });
    };

    return (<>
        <button type="button" className="btn rounded-pill mt-1 mb-1 btn-danger" onClick={handleModalShow}
                disabled={props.isDisabled ?? false}>
            Törlés
        </button>
        <Modal isShow={isModalShow} handleClose={handleModalClose} color={props.color}
               handleDelete={handleDelete} isDeleting={isDeleting} deleteFailed={deleteFailed}/>
    </>);
}
