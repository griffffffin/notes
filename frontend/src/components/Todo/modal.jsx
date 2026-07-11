import ReactModal from "react-bootstrap/Modal";
import SubmitButton from "../Button/submitButton";

export default function Modal(props) {
    return (
        <ReactModal show={props.isShow} onHide={props.handleClose} contentClassName={"mt-5 text-" + props.color +
            " border-3 border-" + props.color + " bg-" + props.backgroundColor}>
            <ReactModal.Header closeButton className="text-center ms-1 py-2 border-0">
                <ReactModal.Title className="text-center">Törlés</ReactModal.Title>
            </ReactModal.Header>
            <ReactModal.Body className="pt-0">
                <div className="ms-2 pb-3">Biztosan törlöd?</div>
                <div className="d-grid">
                    <SubmitButton onClick={props.handleClose} isOutline={false} color={props.color} isDisabled={false}
                                  text="Vissza"/>
                    <SubmitButton onClick={props.handleDelete} isOutline={false} color="danger" isDisabled={false}
                                  text="Törlés"/>
                </div>
            </ReactModal.Body>
        </ReactModal>
    );
}
