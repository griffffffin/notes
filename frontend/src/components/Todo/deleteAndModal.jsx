import {useCallback, useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import Modal from "./modal";

export default function DeleteAndModal(props) {
    const [isModalShow, setIsModalShow] = useState(false);
    const navigate = useNavigate();

    const handleModalShow = useCallback(() => {
        props.handleLinkClicked();
        props.setIsCategoryClicked(false);
        props.setIsColorClicked(false);
        setIsModalShow(true);
    }, [props]);

    const handleModalClose = useCallback(() => setIsModalShow(false), []);

    useEffect(() => {
        if (isModalShow) document.getElementsByClassName("btn-close")[0].classList.add(props.color);
    }, [isModalShow, props.color]);

    const handleDelete = useCallback(() => {
        handleModalClose();
        props.handleAxios("/delete", {id: props.location.state.id, user: props.cookies.user}, (response) => {
            if (response.status === 200) {
                console.log(response.data);
                props.handleCategoryChange();
                navigate("/");
            }
        }, (error) => console.log(error.response?.data ?? error.message));
    }, [handleModalClose, props, navigate]);

    return (<>
        <button type="button" className="btn rounded-pill mt-1 mb-1 btn-danger" onClick={handleModalShow}>
            Törlés
        </button>
        <Modal isShow={isModalShow} handleClose={handleModalClose} color={props.color}
               handleDelete={handleDelete}/>
    </>);
}
