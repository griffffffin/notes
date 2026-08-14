import {useState} from "react";
import {useNavigate} from "react-router-dom";
import Modal from "./modal";
import {useAuth} from "../../contexts/auth-context";
import {logRequestError} from "../../log";
import {ENDPOINTS} from "../../endpoints";
import type {Endpoint} from "../../endpoints";
import type {Id} from "../../types/api";
import type {BootstrapColor} from "../../contexts/theme-context";

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
    itemId?: Id | null;
    todoId?: Id | null;
    setIsCategoryClicked?: (isClicked: boolean) => void;
    setIsColorClicked?: (isClicked: boolean) => void;
    handleCategoryChange?: () => void;
    onDelete?: () => void;
};

export default function DeleteAndModal(props: DeleteAndModalProps) {
    const [isModalShow, setIsModalShow] = useState(false);
    const navigate = useNavigate();
    const {handleAxios} = useAuth();

    /* A törlés-modal két szerkesztőt szolgál ki. A to-do a todoId-t adja, plusz a
       navbar-szűrők zárását és a kategória-lista frissítését; az idézetnek csak a
       saját törlő-végpontja és listája van. A defaultok a to-dóra állnak (hogy az
       ő hívása ne változzon), a to-do-specifikus callbackek pedig opcionálisak. */
    const deleteUrl = props.deleteUrl ?? ENDPOINTS.todoDelete;
    const listUrl = props.listUrl ?? "/to-dos";
    const itemId = props.itemId ?? props.todoId;

    /* Nincs useCallback: ezek onClick-ekre mennek, memózatlan komponensekre. */
    const handleModalShow = () => {
        props.handleLinkClicked();
        props.setIsCategoryClicked?.(false);
        props.setIsColorClicked?.(false);
        setIsModalShow(true);
    };

    const handleModalClose = () => setIsModalShow(false);

    const handleDelete = () => {
        handleModalClose();
        // A szerkesztő jelezni kérheti, hogy törlés indul (onDelete) — így a leváláskori
        // (unmount) mentése NEM próbálja visszamenteni a már törölt elemet.
        props.onDelete?.();
        // Kész id-t kapunk (a szerkesztő az URL-ből olvassa ki); törlés után a
        // saját listára megyünk, mert a szerkesztett elem megszűnt.
        handleAxios(deleteUrl, {id: itemId}, (response) => {
            if (response.status === 200) {
                props.handleCategoryChange?.();
                navigate(listUrl);
            }
        }, logRequestError);
    };

    return (<>
        <button type="button" className="btn rounded-pill mt-1 mb-1 btn-danger" onClick={handleModalShow}>
            Törlés
        </button>
        <Modal isShow={isModalShow} handleClose={handleModalClose} color={props.color}
               handleDelete={handleDelete}/>
    </>);
}
