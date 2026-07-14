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
        handleAxios("/delete", {id: props.location.state.id}, (response) => {
            if (response.status === 200) {
                console.log(response.data);
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
