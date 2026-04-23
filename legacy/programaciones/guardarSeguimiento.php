<?php

error_reporting(0); // TODO daba errores con new SimpleXMLElement(x,null,x)

$nombre_dpto = $_REQUEST['departamento'];
$nombre_curso = $_REQUEST['curso'];
$nombre_asignatura = $_REQUEST['asignatura'];
$nombre_grupo = $_REQUEST['grupo'];
$mps = $_REQUEST['mps'];
$nif = $_REQUEST['nif'];

$fSeguimiento = "dat/seguimiento-" . $nif . ".xml";
$seguimiento = new SimpleXMLElement($fSeguimiento, null, true);
?>
<html>
    <head>
        <link rel="stylesheet" href="css/estilos.css" media="all" />
        <script language="javascript">
            <!--
            function volver() {
                window.location =
                    <?php
                    echo "'seguimiento.php?" .
                     "departamento=" . $nombre_dpto . "&" .
                     "curso=" . $nombre_curso . "&" .
                     "asignatura=" . $nombre_asignatura . "&" .
                     "grupo=" . $nombre_grupo . "&" .
                     "mps=" . $mps .
                     "'";
                    ?>
                            ;
                        }
                        //-->
        </script>
    </head>
    <body>
        <?php
        /**
         * datosURI contiene los valores de la información pasada por GET ó POST
         * 0 nif
         * 1 departamento
         * 2 curso
         * 3 asignatura
         * 4 grupo
         * 5 mps
         * 6, 7, 8 (fini,ffin,comentario), 9, 10, 11, (etc...)
         *
         */
        $datosURI[0] = 0;
        $i = 0;
        foreach ($_REQUEST as $key => $value) {
            $datosURI[$i++] = $value;
        }


        foreach ($seguimiento as $asignatura) {
            if (strcmp($asignatura['nombre'], $nombre_asignatura) == 0 &&
                    strcmp($asignatura['grupo'], $nombre_grupo) == 0) {

                $i = 6; //Empezamos por el primer dato del primer tema
                foreach ($asignatura as $tema) {
                    if ($datosURI[$i] != "") {
                        $tema['fini'] = date("Y-n-j", strtotime($datosURI[$i++]));
                    } else {
                        $tema['fini'] = "";
                        $i++;
                    }
                    if ($datosURI[$i] != "") {
                        $tema['ffin'] = date("Y-n-j", strtotime($datosURI[$i++]));
                    } else {
                        $tema['ffin'] = "";
                        $i++;
                    }
                    $tema['comentario'] = $datosURI[$i++];
                }
            }
        }

        $seguimiento->asXML($fSeguimiento);
        ?>
        <h1>Datos guardados</h1>
        <form name="fGuardar">
            <input type="button" value="Volver" onclick="volver()"/>
        </form>
    </body>

</html>
