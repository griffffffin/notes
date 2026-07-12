import {useCallback} from "react";
import {useNavigate} from "react-router-dom";
import LinkLogo from "../Link/logo";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useTheme} from "../../contexts/theme";

export default function LogoAndCreate(props) {
    const navigate = useNavigate();
    const {color} = useTheme();

    const handleCreateClick = useCallback(() => {
        props.handleLinkClicked();
        navigate("/create");
    }, [props, navigate]);

    return (
        <div className="d-grid pb-1">
            <div className="input-group align-items-center">
                <LinkLogo onClick={props.isVisible && props.handleLinkClicked}/>
                {props.isCreateVisible &&
                    <FontAwesomeIcon role="button" className={"pt-1 ms-sm-3 ps-3 text-" + color}
                                     icon="fa-solid fa-plus" size="2x" onClick={handleCreateClick}/>
                }
            </div>
        </div>
    );
}
