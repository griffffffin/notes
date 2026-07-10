import {useEffect, useState} from "react";
import Spinner from "../spinner";
import ReactSwitch from "react-switch";
import sun from "../../assets/icons/switch/sun.png";
import moon from "../../assets/icons/switch/moon.png";

export default function Switch(props) {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (props.color) setIsLoading(false);
    }, [props.color]);

    return (
        isLoading ? <Spinner/> :
            <ReactSwitch checked={props.isChecked} onChange={props.onChange} boxShadow={"0 0 2px 2px " + props.color}
                         activeBoxShadow={"0 0 2px 2px " + props.color} onColor="#c11d31" offColor="#213e90"
                         checkedIcon={<div className="h-100 d-flex justify-content-center align-items-center">
                             <img className="h-100" alt="" src={sun}/>
                         </div>}
                         uncheckedIcon={<div className="h-100 d-flex justify-content-center align-items-center">
                             <img className="h-75" alt="" src={moon}/>
                         </div>}/>
    );
}
