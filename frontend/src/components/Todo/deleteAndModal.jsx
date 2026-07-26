import {useState} from "react";
import {useNavigate} from "react-router-dom";
import Modal from "./modal";
import {useAuth} from "../../contexts/auth";
import {logRequestError} from "../../log";

export default function DeleteAndModal(props) {
    const [isModalShow, setIsModalShow] = useState(false);
    const navigate = useNavigate();
    const {handleAxios} = useAuth();

    /* A törlés-modal két szerkesztőt szolgál ki. A to-do a todoId-t adja, plusz a
       navbar-szűrők zárását és a kategória-lista frissítését; az idézetnek csak a
       saját törlő-végpontja és listája van. A defaultok a to-dóra állnak (hogy az
       ő hívása ne változzon), a to-do-specifikus callbackek pedig opcionálisak. */
    const deleteUrl = props.deleteUrl ?? "/to-do/delete";
    const listUrl = props.listUrl ?? "/to-do";
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
