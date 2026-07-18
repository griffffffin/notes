import {useState} from "react";
import {useNavigate} from "react-router-dom";
import Modal from "./modal";
import {useAuth} from "../../contexts/auth";
import {logRequestError} from "../../log";

export default function DeleteAndModal(props) {
    const [isModalShow, setIsModalShow] = useState(false);
    const navigate = useNavigate();
    const {handleAxios} = useAuth();

    /* Nincs useCallback: ezek onClick-ekre mennek, memózatlan komponensekre. */
    const handleModalShow = () => {
        props.handleLinkClicked();
        props.setIsCategoryClicked(false);
        props.setIsColorClicked(false);
        setIsModalShow(true);
    };

    const handleModalClose = () => setIsModalShow(false);

    const handleDelete = () => {
        handleModalClose();
        // Kész id-t kapunk, nem a nyers location-t: a navigációs state
        // kicsomagolása a Save dolga, itt már csak "melyik to-do" a kérdés.
        handleAxios("/delete", {id: props.todoId}, (response) => {
            if (response.status === 200) {
                props.handleCategoryChange();
                navigate("/");
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
