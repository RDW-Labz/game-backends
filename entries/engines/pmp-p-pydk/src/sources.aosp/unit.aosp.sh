export URL_UNIT=${URL_UNIT:-"GIT_REPOSITORY https://github.com/pmp-p/pydk.git"}
export HASH_UNIT=${HASH_UNIT:-}


unit_host_cmake () {
    cat >> CMakeLists.txt <<END
#${unit}

if(0)
ExternalProject_Add(
    ${unit}
    ${URL_UNIT}
    ${HASH_UNIT}

    DOWNLOAD_NO_PROGRESS ${CI}

    CONFIGURE_COMMAND sh -c "echo 1>&1;echo external.configure ${unit} 1>&2"
    BUILD_COMMAND ""
    INSTALL_COMMAND ""
)
else()
    message(" ********************************************************************")
    message("  No cmake ExternalProject_Add defined for unit : ${unit}")
    message(" ********************************************************************")
endif()

END
}

unit_patch () {
    echo
}

unit_build () {
    echo
}

unit_crosscompile () {
    echo
}



