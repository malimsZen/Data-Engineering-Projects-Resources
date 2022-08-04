/*******************************************************************************
 * IBM Confidential
 * OCO Source Materials
 * 5737-C49, 5737-B37
 * (C) Copyright IBM Corp. 2016, 2018
 *
 * The source code for this program is not published or otherwise divested of
 * its trade secrets, irrespective of what has been deposited with the
 * U.S. Copyright Office.
 *******************************************************************************/
"use strict";

(function () {
	let isReady = false;
	document.addEventListener("DOMContentLoaded", function onLoad() {
		if (isReady) {
			console.warn("WARNING: Trying to call init() on left-nav more than once");
			return;
		}

		const dapHeader = window.dapHeader;
		if (!dapHeader) {
			console.warn("WARNING: Top nav global object not found. Top-nav will not be functional");
			return;
		}

		if (!dapHeader.addMenuChangeListener) {
			console.warn("WARNING: Top nav global object does not contain 'addMenuChangeListener' API");
		} else {
			const contentNode = document.getElementById("contentNode");
			if (!contentNode) {
				console.warn("WARNING: Element 'contentNode' is undefined");
				return;
			}

			dapHeader.addMenuChangeListener(function (menu) {
				if (menu === "sidemenu") {
					/*
					if (window.location.pathname === "/analytics") {
						contentNode.classList.toggle("sidemenu-opened");
					}
					*/
				} else if (menu === "profilemenu") {
					contentNode.classList.toggle("profilemenu-opened");
				} else if (menu === "communitymenu") {
					contentNode.classList.toggle("communitymenu-opened");
				} else {
					contentNode.classList.remove("sidemenu-opened");
				}
			});
		}

		isReady = true;
	});
})();
