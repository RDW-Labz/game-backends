export URL_SQLITE3=${URL_SQLITE3:-"GIT_REPOSITORY https://github.com/azadkuh/sqlite-amalgamation.git"}
export HASH_SQLITE3=${HASH_SQLITE3:-}

sqlite3_host_cmake () {
    cat >> CMakeLists.txt <<END

if(1)
    message("")
    message(" processing unit : ${unit}")
ExternalProject_Add(
    sqlite3
    ${URL_SQLITE3}
    ${HASH_SQLITE3}

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

sqlite3_patch () {
    echo
}

sqlite3_build () {
    echo
}

sqlite3_crosscompile () {
    if [ -f  ${APKUSR}/lib/libsqlite3.a ]
    then
        echo "    -> sqlite3 already built for $ABI_NAME"
    else
        PrepareBuild ${unit}
        $ACMAKE ${BUILD_SRC}/${unit}-prefix/src/${unit} && make -s install
    fi
}



