import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import Modal from "./modal";
import {useAuth} from "../../contexts/auth";

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

    useEffect(() => {
        if (isModalShow) document.getElementsByClassName("btn-close")[0].classList.add(props.color);
    }, [isModalShow, props.color]);

    const handleDelete = () => {
        handleModalClose();
        // Kész id-t kapunk, nem a nyers location-t: a navigációs state
        // kicsomagolása a Save dolga, itt már csak "melyik to-do" a kérdés.
        handleAxios("/delete", {id: props.todoId}, (response) => {
            if (response.status === 200) {
                props.handleCategoryChange();
                navigate("/");
            }
        }, (error) => console.log(error.response?.data ?? error.message));
    };

    return (<>
        <button type="button" className="btn rounded-pill mt-1 mb-1 btn-danger" onClick={handleModalShow}>
            Törlés
        </button>
        <Modal isShow={isModalShow} handleClose={handleModalClose} color={props.color}
               handleDelete={handleDelete}/>
    </>);
}
