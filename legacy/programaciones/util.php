<?php
error_reporting(0); //TODO daba errores con new SimpleXMLElement (x,null,x)
$minutosPorSesion = 55;
$horasPorSesion = $minutosPorSesion / 60;

function getDatosGrupo($nombre_dpto, $nombre_curso, $nombre_asignatura, $nombre_grupo) {
	$fProgramacion="dat/programaciones.xml";
	$programacion = new SimpleXMLElement($fProgramacion, null, true);
	foreach ( $programacion as $dpto) {
		if ($dpto['nombre']==$nombre_dpto) {
			foreach ( $dpto as $curso) {
				if ($curso['nombre']==$nombre_curso) {
					foreach ($curso as $asignatura) {
						if ($asignatura['nombre']==$nombre_asignatura) {
							foreach ($asignatura->grupo as $grupo) {
								if ($grupo['id']==$nombre_grupo) {
									return $grupo;
								}
							}
						}
					}
				}
			}
		}
	}
}

function getTemasAsignatura($nombre_dpto, $nombre_curso, $nombre_asignatura) {
	$fProgramacion="dat/programaciones.xml";
	$programacion = new SimpleXMLElement($fProgramacion, null, true);
	foreach ( $programacion as $dpto) {
		if ($dpto['nombre']==$nombre_dpto) {
			foreach ( $dpto as $curso) {
				if ($curso['nombre']==$nombre_curso) {
					foreach ($curso as $asignatura) {
						if ($asignatura['nombre']==$nombre_asignatura) {
							return ($asignatura->tema);
						}
					}
				}
			}
		}
	}
}

/**
 * Devuelve los elementos XML del fichero de seguimiento del profesor "nif"
 * @param string $nif nif del profesor
 * @param string $nombre_asignatura nombre de la asignatura
 * @param string $nombre_grupo nombre del grupo
 * @return lista de elementos xml, tipo "tema"
 */
function getSeguimientoAsignatura($nif, $nombre_asignatura, $nombre_grupo) {
	$fSeguimiento="dat/seguimiento-".$nif.".xml";
	$seguimiento = new SimpleXMLElement($fSeguimiento, null, true);
	foreach ( $seguimiento as $asignatura) {
		if (	strcmp($asignatura['nombre'],$nombre_asignatura)==0 && 
				strcmp($asignatura['grupo'],$nombre_grupo)==0) {
			return ($asignatura->tema);
		}
	}
}

function getFiniSeguimiento($seguimientoTemas, $n) {
	foreach ($seguimientoTemas as $tema) {
		if (strcmp($tema['n'],$n)==0) {
			return $tema['fini'];
		}
	}
}

function getFfinSeguimiento($seguimientoTemas, $n) {
	foreach ($seguimientoTemas as $tema) {
		if (strcmp($tema['n'],$n)==0) {
			return $tema['ffin'];
		}
	}
}

function getComentarioSeguimiento($seguimientoTemas, $n) {
	foreach ($seguimientoTemas as $tema) {
		if (strcmp($tema['n'],$n)==0) {
			return $tema['comentario'];
		}
	}
}

/**
 * @desc Indica si una determinada fecha cae en fin de semana
 * @param $fecha: la fecha para la que queremos comprobar si cae en finde
 * @return true si $fecha cae en fin de semana. false en caso contrario
 */
function esFinDeSemana($fecha) {
	$dia=date("D",$fecha);
	return ($dia=="Sun" || $dia=="Sat");
}

/**
 * @desc Indica si en una determinada fecha ha faltado un determinado profesor
 * @param $fecha: fecha para la que queremos saber si ha faltado
 * @param $profesor: nif del profesor para el que verificar la falta
 * @return boolean: true si $profesor falt� en $fecha. Falso en caso contrario.
 */
function esFalta($fecha,$nif_profesor) {
	$fFaltas="dat/faltas-".$nif_profesor.".xml";
	$faltas = new SimpleXMLElement($fFaltas, null, true);
	$esFalta=false;
	foreach ($faltas as $dia) {
		$esFalta = $esFalta || ($fecha==strtotime($dia));
	}
	return $esFalta;
}
/**
 *
 * @desc Indica si una determinada fecha es d�a festivo (fin de semana o vacaciones
 * @param $fecha: fecha para la que queremos saber si es festivo
 * @param $vacaciones: matriz que contiene las fechas de vacaciones
 * @return boolean: true si $fecha est� entre las fechas proporcionadas
 */
function esFestivo($fecha,$vacaciones) {
	$noLectivo=false;
	foreach ($vacaciones as $dia) {
		$noLectivo = $noLectivo || ($fecha==strtotime($dia));
	}
	return $noLectivo;
}

/**
 * @desc Calcula el numero de sesiones (clases) que han tenido lugar entre un par de fechas
 * @param $ini: cadena de caracteres representando a la fecha inicial del intervalo
 * @param $fin: cadena de caracteres representando a la fecha final del intervalo
 * @param $vacaciones: matriz que contiene una lista de fechas que se consideran no-lectivas
 * @param $grupo: Informacion del grupo. Contiene las sesiones que se dan cada dia (Mon,Tue,Wed,Thu,Fri)
 * @param $hoy: booleano que indica si queremos considerar la fecha de fin hoy o no
 * @return int: el numero de sesiones (clases) ocurridas entre los dos intervalos
 */
function getSesiones($ini,$fin,$vacaciones,$grupo,$hoy=true) {
	$fini=strtotime($ini);
	$ffin=($hoy==true?strtotime(date('y-n-j')):strtotime($fin));//DEBUG
	$numSesiones=0;
	for ($f = $fini; $f <= $ffin; $f+=86400) {
		if (!esFinDeSemana($f) && !esFestivo($f,$vacaciones) && !esFalta($f,$grupo['nif'])) {
			$diaSem=date("D",$f);
			$numSesiones+=$grupo[$diaSem];
		}
	}
	return $numSesiones;
}

/**
 * Devuelve el total de sesiones reales impartidas por un profesor en un grupo determinado para una asignatura
 * @param $nif_profesor nif del profesor para el que se hace la consulta
 * @param $nombre_asignatura nombre de la asignatura para la que se hace la consulta
 * @param $nombre_grupo grupo para el que se hace la consulta
 * @param $vacaciones array asociativo de vacaciones
 * @param $grupo informaci�n del grupo
 * @return el total de sesiones reales impartidas
 */
function getTotalReal($nif_profesor, $nombre_asignatura, $nombre_grupo, $vacaciones, $grupo) {
	$sesiones_reales=0;
	$fSeguimiento="dat/seguimiento-"+$nif_profesor;
	$seguimiento = new SimpleXMLElement($fSeguimiento, null, true);
	foreach ($seguimiento as $asignatura) {
		if ($asignatura[nombre]== $nombre_asignatura && $asignatura[grupo]==$nombre_grupo) {
			foreach ($asignatura as $tema) {
				if ($tema[fini]!="") {
					if ($tema[ffin]!="") {
						$sesiones_reales+=getSesiones($tema[fini],$tema[ffin],$vacaciones,$grupo,false);
					}
					else { //Es el tema actual, y la fecha de fin es hoy
						$sesiones_reales+=getSesiones($tema[fini],$tema[ffin],$vacaciones,$grupo,true);
					}
				}
			}
		}
	}
	return $sesiones_reales;
}

/**
 *
 * @param $temas: array de temas
 * @param $sesiones: numero de sesiones transcurridas
 * @return numero del tema que se esta tratando actualmente
 */
function getNTema($temas,$sesiones) {
	$n=0;
	$i=0;
	do {
		$tema=$temas[$i];
		$nTema=$tema['n'];
		$n += $tema['horas'];
		$i++;
	}
	while ($i<sizeof($temas) && $n<$sesiones);
	//if ($i>=sizeof($temas)) {$nTema="-";} //DEBUG
	return $nTema;
}
/**
 *
 * @param $temas: array de temas
 * @param $sesiones: n�mero de sesiones transcurridas
 * @return titulo del tema que se est� tratando actualmente
 */
function getTituloTema($temas,$sesiones) {
	$n=0;
	$i=0;
	do {
		$tema=$temas[$i];
		$tituloTema=$tema['titulo'];
		$n += $tema['horas'];
		$i++;
	}
	while ($i<sizeof($temas) && $n<$sesiones);
	//if ($i>=sizeof($temas)) {$tituloTema="FINALIZADO";} //DEBUG
	return $tituloTema;
}

/**
 *
 * @param $temas: array de temas
 * @param $sesiones: numero de sesiones transcurridas
 * @return titulo del tema que se esta tratando actualmente
 */
function getPorcentajeTema($temas,$horas) {
	$n=0;
	$i=0;
	$tema="";
	do {
		$tema=$temas[$i];
		$n += $tema['horas'];
		$i++;
		//echo "DEBUG(".$tema[titulo]."): s=".$horas.", n=".$n.", t=".$tema[horas]."<br>";//DEBUG
	}
	while ($i<sizeof($temas) && $n<$horas);
	$sesionesTemaActual=$horas-$n+$tema['horas'];
	//echo "DEBUG horas tema actual=".$sesionesTemaActual."<br>"; //DEBUG
	//echo "<hr>"; //DEBUG
	$porcentajeTemas=$sesionesTemaActual>=$tema['horas']?100:(($sesionesTemaActual*100)/$tema['horas']);
	return $porcentajeTemas;
}

function getPorcentajeTotal($temas,$horas) {
	$totalHoras=0;
	$i=0;
	do {
		$tema=$temas[$i];
		$totalHoras += $tema['horas'];
		$i++;
	}
	while ($i<sizeof($temas));
	return $horas>=$totalHoras?100:(($horas*100)/$totalHoras);
}
?>
