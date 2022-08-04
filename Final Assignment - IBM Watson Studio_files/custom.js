/*
# Licensed Materials - Property of IBM
# 5737-C49
# 5737-B37
# 5737-D37
# (C) Copyright IBM Corp. 2015, 2016    All Rights Reserved.
# US Government Users Restricted Rights - Use, duplication or disclosure
# restricted by GSA ADP Schedule Contract with IBM Corp.
*/

'use strict';

var notebookuiPrefix='notebookUI';
var kernelMonitor = null;
var mark_terminated = false;

var COMPUTE_TYPE_SPARK = "spark";
var COMPUTE_TYPE_DSX_ENVIRONMENTS = "dsx_environment";
var COMPUTE_TYPE_AWS = 'aws_emr';
var COMPUTE_TYPE_IAE = 'analytics_engine';
var COMPUTE_TYPE_WCE = 'wce';

var PROJECT_LIB_SEGMENTATION_EVENT = 'project_lib_segment';


define(['base/js/namespace',
        'base/js/events',
        'notebook/js/outputarea',
        'notebook/js/notebook', 'components/moment/moment'],
  function (Jupyter, events, outputArea, notebook, moment) {
    onPageLoaded(moment);
    //events.on('app_initialized.NotebookApp', onPageLoaded);
    //events.on('app_initialized.NotebookApp', function () {console.log("App initialized")});
    if (Jupyter.notebook._fully_loaded === true) {
        console.log("Notebook loaded event was triggered before custom.js loaded. Notebook is successfully loaded.");
        onNotebookLoaded();
    } else {
        events.on('notebook_loaded.Notebook', onNotebookLoaded);
        events.on('notebook_load_failed.Notebook', onNotebookLoadedFailed);
    };
    events.on('spec_changed.Kernel', handleKernelCreated);
    events.on('kernel_created.Session', handleKernelStarting);
    events.on('kernel_connection_failed.Kernel kernel_dead.Kernel kernel_dead.Session no_kernel.Kernel kernel_disconnected.Kernel', sendNewRelicMessage);
    events.on('kernel_ready.Kernel', registerSparkMonitorHandler);
    events.on('kernel_ready.Kernel', registerProjectLibSegmentHandler);
    events.on('execute.CodeCell', executeCellHandler);
    events.on('notebook_save_failed.Notebook notebook_saved.Notebook', notebookSaved)
    events.on('custom.clear_cell_output', clearSparkTableHandler);
    events.on('custom.load_notebook_success', loadNotebookSuccesshandler);

    // init jupyter customizer module and invoke to-be-customized-objs handlers
    _initCustomGlobalObjExtensions(events, outputArea, notebook);
    _fetch_spark_monitoring_state();
    _sendKernelInfo();
  });

function _sendKernelInfo() {
  try {
    var kernel_name = Jupyter.notebook.kernel.name;
    console.log("Kernel Name: " + kernel_name);
    var ks = Jupyter.kernelselector.kernelspecs[kernel_name];
    var kernel_id = Jupyter.notebook.session.kernel_model.id;
    var evt_type="kernel_created";
    var event_name = notebookuiPrefix+"."+evt_type;
    var message = {'language': ks.spec.language, 'display_name': ks.spec.display_name, 'name': ks.name, 'kernel_id': kernel_id};
    send_event_message_to_parent(event_name, message);
  } catch (error) {
    console.log("Notebook loaded before the kernel was started.");
  }
}

function _getBaseURL() {
  return ((Jupyter &&
          Jupyter.menubar &&
          Jupyter.menubar.notebook &&
          Jupyter.menubar.notebook.base_url) ? Jupyter.menubar.notebook.base_url : '');
}

function getComputeType(check_parent=false) {
    var computeType = COMPUTE_TYPE_SPARK;
    try {
      var base_url = _getBaseURL();
      if (base_url.toLowerCase().indexOf("data/jupyter2/armada/") > -1 || base_url.toLowerCase().indexOf("data/jupyter2/runtimeenv") > -1) {
          computeType = COMPUTE_TYPE_DSX_ENVIRONMENTS;
      } else if (base_url.toLowerCase().indexOf("data/jupyter/") > -1) {
          computeType = COMPUTE_TYPE_AWS;
      }
      if (check_parent && parent && parent.document) {
        var dataElement = parent.document.getElementById('data');
        if (dataElement) {
          var computeFromDataElement = dataElement.getAttribute('data-compute-type');
          if (computeFromDataElement) {
            computeType = computeFromDataElement;
          }
        }
      }
    } catch (e) {
      console.log("Compute Type could not be established. Fallback used instead");
    }
    console.log("Compute Type: " + computeType);
    return computeType;
}

function sendNewRelicMessage(evt, info) {
    try {
        if (parent !== self && typeof parent.newrelic !== "undefined") {
            var username = "";
            var computeType = COMPUTE_TYPE_SPARK;
            var base_url = _getBaseURL();
            if (parent.document.getElementById('data') !== null) {
                username = parent.document.getElementById('data').getAttribute('data-username');
            };
            if (base_url.toLowerCase().indexOf("data/jupyter2/armada/") > -1 || base_url.toLowerCase().indexOf("data/jupyter2/runtimeenv") > -1 ) {
                computeType = COMPUTE_TYPE_DSX_ENVIRONMENTS;
            }
            var notebook = Jupyter.notebook;
            var kernel_name = notebook.session.kernel_model.name;
            var kernel_id = notebook.session.kernel_model.id;
            var nb_id = notebook.notebook_path.split('/')[1];
            var instance_id = notebook.base_url.split('/')[3];
            var event = evt.type;
            var newRelicMessage = {
                notebook_event_type: event,
                notebook: nb_id,
                instance: instance_id,
                kernel_name: kernel_name,
                username: username,
                kernel_id: kernel_id,
                computeType: computeType
            };
            parent.newrelic.addPageAction("Jupyter_Notebook", newRelicMessage);
        };
    } catch (e) {
        console.log("Sending New Relic Event failed.")
    }
}

////////////////////////////////////////
/////// Segment Instrumentation ////////
////////////////////////////////////////
function sendSegmentEventFromIframe(eventTitle, data) {
  var errMessage = 'Error sending Segment event';
  try {
    if (window &&
        window.parent &&
        (window !== window.parent)) {
      var parentWindow = window.parent;
      if (parentWindow && parentWindow.analytics) {
        // check for productTitle and category attributes
        if (data && (!data.productTitle)) {
          data.productTitle = 'DSX';
        }

        if (data && (!data.category)) {
          data.category = 'Notebooks (DSX)';
        }

        parentWindow.analytics.track(eventTitle, data);
        return;
      }
    }
  } catch (e) {
    console.warn(errMessage);
    console.warn(e);
  }
}

function getNotebookId() {
  var notebookObj = (Jupyter ? Jupyter : IPython);
  return ((notebookObj &&
           notebookObj.notebook &&
           notebookObj.notebook.notebook_path) ? notebookObj.notebook.notebook_path.replace('/', '') : '');
}

function handleKernelCreated (evt, ks) {
    send_event_message_to_parent(notebookuiPrefix+"."+evt.type, {'language': ks.spec.language, 'display_name': ks.spec.display_name, 'name': ks.name});
}

function handleKernelStarting (evt, message) {
    try {
        var kernel_name = message.kernel.name;
        var ks = Jupyter.kernelselector.kernelspecs[kernel_name];
        var kernel_id = Jupyter.notebook.session.kernel_model.id;
        console.log("Kernel Name: " + kernel_name);
        var event_name = notebookuiPrefix+"."+evt.type;
        var message = {'language': ks.spec.language, 'display_name': ks.spec.display_name, 'name': ks.name, 'kernel_id': kernel_id};
        send_event_message_to_parent(event_name, message);
    } catch (e) {
        console.error("Unable to handle kernel starting: " + e.message);
    }
}

function send_event_message_to_parent(type, content) {
    var msg = {};
    msg['type'] = type;
    msg['content'] = content || null;
    parent.postMessage(msg, window.origin);
    console.log("Message sent: "+JSON.stringify(msg))
}

function onNotebookLoaded() {
  broadcastFinishedLoadingMessageToParent();
  customizeNotebookSaveWidget();
  addUnloadEvent();
  console.log("Notebook Loaded.");
}

function hideEditKeyboardShortcutsButton() {
  var original_function = Jupyter.quick_help.build_command_help
  Jupyter.quick_help.build_command_help = function() {
    var div = original_function.apply(Jupyter.quick_help);
    div.find("button[title='edit command-mode keyboard shortcuts']").hide()
    return div
  };
}

function reorderKernelMenu() {
    var menu = $("#menu-change-kernel-submenu");
    var items = $.map(menu.children(), function(value, index) {
            return [value];
        });
    items.sort(kernelMenuItemComparator);
    items.forEach(function(item){ menu.get(0).appendChild(item); });
}
function kernelMenuItemComparator(nodeA, nodeB) {
    if (nodeA === nodeB) {
        return 0;
    }
    var a = nodeA.id;
    var b = nodeB.id;
    if (a === b) {
        return 0;
    }

    // the rescue kernel is always last
    if (_endsWith(a, "-rescue") || _endsWith(a, "-nospark")) {
        return 1;
    }
    if (_endsWith(b, "-rescue") || _endsWith(b, "-nospark")) {
        return -1;
    }

    var apos = a.lastIndexOf("-spark");
    var bpos = b.lastIndexOf("-spark");

    // sort by programming language, ascending
    var alang = (apos < 0) ? a : a.slice(0, apos);
    var blang = (bpos < 0) ? b : b.slice(0, bpos);
    if (alang > blang) {
        return 1;
    }
    if (alang < blang) {
        return -1;
    }

    // sort by Spark version, descending
    var aspark = (apos < 0) ? "-spark16" : a.slice(apos);
    var bspark = (bpos < 0) ? "-spark16" : b.slice(bpos);
    if (aspark > bspark) {
        return -1;
    }
    if (aspark < bspark) {
        return 1;
    }

    return 0;
}

function _endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}


function addUnloadEvent() {
    var event = 'unload';
    if (_is_safari()) {
        event = 'pagehide';
        console.log("Safari browser will use hide event instead of unload");
    }
    var utils = requirejs('base/js/utils');
    var base_url = _getBaseURL();

    window.addEventListener(event, function() {
            var notebookId = Jupyter.notebook.notebook_path.replace('/', '');
            var notebookUnlockURL =  utils.url_join_encode(base_url, 'api','locks', notebookId, 'unlock');
            console.log("Unlock URL: "+notebookUnlockURL);
            try {
                navigator.sendBeacon(notebookUnlockURL, {});
                console.log("Unlock beacon sent");
            } catch (e) {
                console.log("sendBeacon is not supported");
                sendUnlockRequest(notebookUnlockURL);
                console.log("ajax request sent");
            }
    });

    function _is_safari() {
        if (navigator.userAgent.indexOf('Safari') != -1 && navigator.userAgent.indexOf('Chrome') == -1) {
            return true;
        }
        return false;
    }
}

function sendUnlockRequest(url){
    $.ajax(url, {
                processData: false,
                async: false,
                cache: false,
                type: "POST",
                dataType: "json",
                data: {},
                timeout: 400,
                success: null,
                error: null
            });
}

function onNotebookLoadedFailed() {
  broadcastFinishedLoadingMessageToParent();
  console.log("Notebook Loading Failed.");
}

function notebookSaved() {
    if (mark_terminated) {
        send_event_message_to_parent('notebookUI.terminated')
        mark_terminated = false;
    }

    if (!files_api_enabled) {
        delete $.ajaxSettings.headers["x-storage-type"]
    }
}

function onPageLoaded(moment) {
  console.log("Page loaded");
  if (!kernelMonitor) {
    console.log("Initializing kernel monitor ...");
    kernelMonitor = new KernelConnectionMonitor(Jupyter.keyboard_manager);
    console.log("Kernel monitor initialized");
  }
  var computeType = getComputeType();
  if (computeType !== COMPUTE_TYPE_SPARK) {
    kernelMonitor.addEventListeners(70000);
  } else {
    changeKernelAutorestartingDialog();
    console.log("Autorestart dialog changed");
  }
  includeIconSpriteToBody(menuButtonCustomizer);
  console.log("Icons included");
  replaceLabelsInToolbar();
  console.log("Labels replaced");
  hideDownloadAsMenuItems()
  reorderKernelMenu();
  console.log("Kernel Menu rearranged");
  setupEventListeners();
  console.log("Set Event Listeners");
  changeKernelInterruptDialog();
  console.log("Interrupt dialog changed");
  replaceDownloadAsIpynb();
  console.log("Replace Download as");
  loadCustomMethods();
  console.log("Custom methods loaded");
  changeMenuActions();
  console.log("Menu Actions Changed");
  replaceRestoreCheckpointDialog(moment);
  console.log("Checkpoint Dialog replaced");
  hideEditKeyboardShortcutsButton();
  send_event_message_to_parent('notebookUI.featureList', {'version_events': true, 'advanced_insert_to_code': true, 'spec_changed': true});
  addArgumentsToNbconvert();
  addNewCellEventListener();
}

function customizeNotebookSaveWidget() {
  Jupyter.notification_area.events.on('notebook_saved.Notebook', function () {
    var options = {};
    options.class = 'ax_notebook_saved';
    Jupyter.notification_area.widget('notebook').set_message("Notebook saved", 2000, null, options);
  });
}

function changeMenuActions() {
    var ax_save_notebook_action = {help: "Save Notebook",
                                   help_index : 'fb',
                                   icon: 'fa-save',
                                   handler : function() {
                                                            Jupyter.notebook._checkpoint_after_save = false;
                                                            Jupyter.notebook.save_notebook();
                                                        }
                                   };
    Jupyter.toolbar.actions._actions["jupyter-notebook:save-notebook"] = ax_save_notebook_action
    Jupyter.menubar.element.find('#save_version').click(function () {
        createCheckpoint()
    });
    Jupyter.menubar.element.find('#save_to_files').click(function () {
        saveToFilesAPI();
    });
    Jupyter.menubar.element.find('#save_notebook').click(function () {
        Jupyter.notebook.save_notebook();
    });
    console.log("Changed Actions Menu")
}

function includeIconSpriteToBody(callback) {
  var iconSpriteContainer = $('<div>', {
    'class': 'iconsprite'
  });
  $('body').append(iconSpriteContainer);
  $('.iconsprite').load('../custom/icons_nb/icons.svg', callback);
  console.log("Done loading includeIconSpriteToBody.");
}

function replaceIcons() {
  replaceElementWithSVG($('.fa-save'), 'icon_save');
  replaceElementWithSVG($('.fa-plus'), 'icon_add');
  replaceElementWithSVG($('.fa-cut'), 'icon_cut');
  replaceElementWithSVG($('.fa-copy'), 'icon_copy');
  replaceElementWithSVG($('.fa-paste'), 'icon_paste');
  replaceElementWithSVG($('.fa-arrow-up'), 'icon_up');
  replaceElementWithSVG($('.fa-arrow-down'), 'icon_down');
  replaceElementWithSVG($('.fa-step-forward'), 'icon_play');
  replaceElementWithSVG($('.fa-stop'), 'icon_stop');
  replaceElementWithSVG($('.fa-repeat'), 'icon_refresh');
  replaceElementWithSVG($('.fa-keyboard-o'), 'icon_keyboard');
  console.log("Done loading replaceIcons.");
}

function replaceElementWithSVG(element, svgClass) {
  if (element) {
    var svgContainer = '<svg class="icon ' + svgClass + '"><use xlink:href="#' +
      svgClass + '"></svg>';
    element.replaceWith(svgContainer);
    console.log("Done loading replaceElementWithSVG.");
  }
}

function addNewCellEventListener() {
  Jupyter.notebook.events.on('create.Cell', function(event, data) {
    if (data && data.cell && data.cell.element) {
      replaceElementWithSVG($(data.cell.element).find('.fa-step-forward'), 'icon_play');
    }
  });
}

function menuButtonCustomizer() {
  // replace to custom icons
  replaceIcons();
}

function addNewCustomButtons(callback) {
  // add spark monitor button
  addSparkMonitorControllerButton(function (err) {
    if (err) {
      callback(err);
      return;
    }

    registerSparkMonitorControllerButtonEventHandler();
    callback(null);
  });
}

function addSparkMonitorControllerButton(callback) {
  var $runButtons = $('#run_int');
  if ($runButtons && $runButtons.length) {
    // render button template
    //prepare context
    if (!CDSXAX || (!CDSXAX.SparkJobMonitorHandler)) {
      callback({
        msg: 'Error SparkJobMonitorHandler not found!'
      });
      return;
    }

    var activeState = CDSXAX.SparkJobMonitorHandler.isSparkMonitorActive();
    var context = {
      groupButton: true,
      id: 'spark_monitor_control',
      buttonList: [{
        id: 'spark_monitor_activation',
        hoverText: 'Enable/Disable Spark Monitoring',
        buttonCustomStyle: 'spark_monitor_button',
        svgCustomStyle: '',
        href: (activeState ? '#icon_spark_monitor_button' : '#icon_spark_monitor_button_inactive')
      }]
    };

    if (CDSXAX && CDSXAX.UIRenderingEngine) {
      CDSXAX.UIRenderingEngine.renderDustTemplate('toolBarButton', context, function (markup) {
        if (!markup) {
          callback({
            msg: 'Error rendering button template!'
          });
          return;
        }

        //bind markup
        $runButtons.after(markup);
        callback(null);
      });
    } else {
      callback({
        msg: 'UIRenderingEngine not found!'
      });
      return;
    }
  } else {
    callback({
      msg: '#run_int anchor is not found!'
    });
    return;
  }
}

function registerSparkMonitorControllerButtonEventHandler() {
  var $sMControllerButton = $('#spark_monitor_activation');
  if ($sMControllerButton && $sMControllerButton.length) {
    $sMControllerButton.on('click', sparkMonitoringClickHandler);
  }
}

function successfulSparkMonitorActivationChange(data) {
  console.log('Spark monitor activation changed successfully.');
  // set spark monitor according to the new state
  CDSXAX.SparkJobMonitorHandler.enableSparkMonitorFeature();

  // send Segment event
  if (data && (typeof data.sparkMonitorEnabled !== 'undefined')) {
    sendSegmentEventFromIframe('NB Active Spark Monitor', {
      notebookId: getNotebookId(),
      numOfSparkTables: (CDSXAX.SparkJobMonitorHandler ? CDSXAX.SparkJobMonitorHandler.getNumOfActiveSparkDicts() : ''),
      action: (data.sparkMonitorEnabled ? 'enable' : 'disable')
    });
  }
}

function failedSparkMonitorActiviationChange(jqXHR) {
  window.console.error('Error changing the spark monitor activation state!');
  if (jqXHR && jqXHR.status) {
    window.console.error('status code:' + jqXHR.status);
  }
}

function setActivationSparkMonitorButton(enabled) {
  var $sMButton = $('#spark_monitor_activation');
  if ($sMButton && $sMButton.length) {
    $sMButton.attr('disabled', !enabled);
  }
}

function sparkMonitoringClickHandler(e) {
  // update spark monitoring tables and context (module logic)
  if (CDSXAX && CDSXAX.SparkJobMonitorHandler) {
    // change the state of the button
    setActivationSparkMonitorButton(false);
    var newState = !CDSXAX.SparkJobMonitorHandler.isSparkMonitorActive();
    CDSXAX.SparkJobMonitorHandler.persistSparkMonitorState(newState)
        .done(successfulSparkMonitorActivationChange)
        .fail(failedSparkMonitorActiviationChange)
        .always(function () {
          setActivationSparkMonitorButton(true);
        });
  }
}

function replaceLabelsInToolbar() {
  wrapCellType();
  setIdForParentOfElement('cell_type_select', $('#cell_type'));
  setIdForParentOfElement('cell_tool_select', $('#ctb_select'));
  $('#cell_type_select').removeClass().addClass('toolbar_select');
  $('#cell_tool_select').removeClass().addClass('toolbar_select');
  $('.navbar-text').removeAttr('class');
  replaceLabels();
  console.log("Done loading replaceLabelsInToolbar.");
}

function hideDownloadAsMenuItems() {
    $('#download_pdf').hide();
}

function wrapCellType() {
  var container = $('<div>');
  $('#cell_type').wrap(container);
  console.log("Done loading wrapCellType.");
}

function setIdForParentOfElement(id, element) {
  element.parent().attr('id', id);
  console.log("Done loading setIdForParentOfElement.");
}

function replaceLabels() {
  var label = $('<span>').html('Format');
  $('#cell_type_select').prepend(label);
  $('#cell_tool_select span').html('Cell Toolbar');

  // Replace hints for the main toolbar icons
  $('[data-jupyter-action="jupyter-notebook:save-notebook"]').attr('title', 'Save Notebook').attr('id', 'ax_save_and_checkpoint');
  $('[data-jupyter-action="jupyter-notebook:insert-cell-below"]').attr('title', 'Insert Cell Below').attr('id', 'ax_insert_cell_below');
  $('[data-jupyter-action="jupyter-notebook:cut-cell"]').attr('title', 'Cut Selected Cell').attr('id', 'ax_cut_selected_cell');
  $('[data-jupyter-action="jupyter-notebook:copy-cell"]').attr('title', 'Copy Selected Cell').attr('id', 'ax_copy_selected_cell');
  $('[data-jupyter-action="jupyter-notebook:paste-cell-below"]').attr('title', 'Paste Cell Below').attr('id', 'ax_paste_cell_below');
  $('[data-jupyter-action="jupyter-notebook:move-cell-up"]').attr('title', 'Move Selected Cell Up').attr('id', 'ax_move_selected_cell_up');
  $('[data-jupyter-action="jupyter-notebook:move-cell-down"]').attr('title', 'Move Selected Cell Down').attr('id', 'ax_move_selected_cell_down');
  $('[data-jupyter-action="jupyter-notebook:run-cell-and-select-next"]').attr('title', 'Run Cell, Select Below').attr('id', 'ax_run_cell_select_below');
  $('[data-jupyter-action="jupyter-notebook:interrupt-kernel"]').attr('title', 'Interrupt Kernel').attr('id', 'ax_interrupt_kernel');
  $('[data-jupyter-action="jupyter-notebook:confirm-restart-kernel"]').attr('title', 'Restart Kernel (With Dialog)').attr('id', 'ax_restart_kernel');
  $('[data-jupyter-action="jupyter-notebook:show-command-palette"]').attr('title', 'Open The Command Palette').attr('id', 'ax_show_command_palette');

  console.log("Done loading replaceLabels.");
}

function setupEventListeners() {
  window.addEventListener('message', handleEventMessage, false);
  console.log("Done loading setupEventListeners.");
}

function handleEventMessage(msg) {
  if (parent === self) {
    console.log("Received message without iframe context");
    return;
  }
  if (!msg || !msg.data) {
    console.log("Received message without content");
    return;
  }
  if (msg.source !== parent) {
    console.log("Received message from a different source than parent window");
    return;
  }

  var message = msg.data;
  switch (message.type) {
    case 'credentials':
    case 'advancedinserttocode':
      chooseInsertToCodeAction(msg);
      break;
    case 'jupyter.sparkMonitorEnabled':
      enableSparkMonitor();
      break;
    case 'jupyter.createVersion':
      createCheckpoint();
      break;
    case 'jupyter.terminate':
      mark_terminated = true;
      saveNotebook();
      Jupyter.notebook.session.delete();
      break;
    case 'jupyter.deleteVersion':
      Jupyter.notebook.list_checkpoints();
      break;
    case 'projectContextCreation':
      insertProjectContextCreationCode(message);
      break;
    case 'projectContextCreationAndDataAccess':
      insertProjectContextCreationAndDataAccessCode(message);
      break;
    case 'jupyter.provide_context_info':
      if (!kernelMonitor) {
        console.log("kernelMonitor is not defined. Instantiating...");
        kernelMonitor = new KernelConnectionMonitor(Jupyter.keyboard_manager);
        console.log("Kernel monitor initialized");
      }
      kernelMonitor.insert_project_parameters(message.content);
      break;
    default:
      chooseInsertToCodeAction(msg);
      break;
  }
}

function enableSparkMonitor() {
  if (CDSXAX &&
      CDSXAX.SparkJobMonitorHandler) {
    var $sparkButtonGroup = $('#spark_monitor_control');
    // ignore message if it has already been received
    if ($sparkButtonGroup && $sparkButtonGroup.length) {
      return;
    }

    console.log('Adding spark monitor control button...');
    // add new buttons
    addNewCustomButtons(function (err) {
      if (err) {
        window.console.error('Error adding spark monitoring menu button!');
        window.console.error(err);
        return;
      }

      // enable spark monitoring rendering
      console.log('Spark Monitoring feature is activated...');
      CDSXAX.SparkJobMonitorHandler.enableSparkMonitorFeatureWithInitState(true);
    });
  }
}

function saveNotebook(){
    Jupyter.notebook._checkpoint_after_save = false;
    Jupyter.notebook.save_notebook();
}

function createCheckpoint(){
    Jupyter.notebook._checkpoint_after_save = true;
    Jupyter.notebook.save_notebook();
}

function saveToFilesAPI(){
    if (!$.ajaxSettings.headers["x-storage-type"]) {
        console.log("x-storage-type header not set")
        $.ajaxSettings.headers["x-storage-type"] = "files_api";
    }
    Jupyter.notebook.save_notebook();
}

function checkPreviousOccurence(variable) {
  var codecell = requirejs('notebook/js/codecell');
  var highestIndex = 0;

  console.log("NB loaded "+JSON.stringify(Jupyter.notebook.get_cell_elements().length));
  var cellsLength = Jupyter.notebook.ncells();
  for (var i=0; i<cellsLength; i++) {
    var currentCell = Jupyter.notebook.get_cell(i);
    var codecelltext;
    var matches;

    if (currentCell instanceof codecell.CodeCell) {
      codecelltext = currentCell.get_text();
      var regex = new RegExp(variable + '_[0-9]*', 'g');
      matches = codecelltext.match(regex);

      if (matches!=null) {
         for(var j=0;j<matches.length;j++) {
           var tempNumber = matches[j].replace(/^\D+/g, '');
           var number = parseInt(tempNumber);
           if (number > highestIndex) {
             highestIndex = number;
           }
         }
      }
    }
  }
  return highestIndex;
}


function checkPreviousOccurenceAdvanced(variable) {
  var codecell = requirejs('notebook/js/codecell');
  var highestIndex = 0;

  console.log("NB loaded "+JSON.stringify(Jupyter.notebook.get_cell_elements().length));
  var cellsLength = Jupyter.notebook.ncells();
  for (var i=0; i<cellsLength; i++) {
    var currentCell = Jupyter.notebook.get_cell(i);
    var codecelltext;
    var matches;

    if (currentCell instanceof codecell.CodeCell) {
      codecelltext = currentCell.get_text();
      var regex = new RegExp(variable + '[0-9]*', 'g');
      //var regex = '/' + variable + '_[0-9]*/g';
      matches = codecelltext.match(regex);

      if (matches!=null) {
         for(var j=0;j<matches.length;j++) {
           var tempNumber = matches[j].replace(/^\D+/g, '');
           var number = parseInt(tempNumber);
           if (number > highestIndex) {
             highestIndex = number;
           }
         }
      }
    }
  }
  return highestIndex;
}

function isJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

function insertProjectContextCreationCode(message) {
  var content = message.content;
  var cell0;
  var code;

  if (checkCodeDuplication(content.questions)) {
    console.log('ProjectContext is present. No need to insert it.');
  } else {
    code = content.codeBlock;
    cell0 = Jupyter.notebook.insert_cell_at_index('code', 0);
    cell0.set_text(code);
  }
}

function insertProjectContextCreationAndDataAccessCode(message) {
  var content = message.content;
  var cell = Jupyter.notebook.get_selected_cell();
  var prepos = cell.get_pre_cursor();
  var postpos = cell.get_post_cursor();
  var variableName = content.variableName;
  var needTwoCells = false;
  var index;
  var newCell;
  var code1;
  var code2;

  if (checkCodeDuplication(content.questions)) {
    code1 = content.codeBlock2;
    // check data container name
    var index1 = checkPreviousOccurenceAdvanced(variableName) + 1;
    var newVariableName1 = variableName + index1;
    var regex1 = new RegExp(variableName + '0', 'g');
    code1 = code1.replace(regex1, newVariableName1);
  } else {
    code1 = content.codeBlock1;
    code2 = content.codeBlock2;
    // check container name
    var index1 = checkPreviousOccurenceAdvanced(variableName) + 1;
    var newVariableName1 = variableName + index1;
    var regex1 = new RegExp(variableName + '0', 'g');
    code2 = code2.replace(regex1, newVariableName1);
    needTwoCells = true;
  }

  if (needTwoCells) {
    index = 0;
    newCell = Jupyter.notebook.insert_cell_at_index('code', index);
    newCell.set_text(prepos + code1 + postpos);
    cell.set_text(code2);
  } else {
    cell.set_text(prepos + code1 + postpos);
  }
}

function chooseInsertToCodeAction(msg) {
  var content = msg.data;

  if(!isJson(content)) {
    console.log("Oldway-> pastecred");
    pasteCred(msg);
  } else {
      console.log('inchoosechooseInsertToCodeAction-else');
      var jsonContent = JSON.parse(content);
      if (jsonContent.type === 'credentials') {
        pasteCred(jsonContent);
      } else if (jsonContent.type === 'advancedinserttocode') {
        advancedInsertToCode(jsonContent.data);
      }
  }
}

function checkCodeDuplication(questions){
  var codecell = requirejs('notebook/js/codecell');
  console.log("NB loaded "+JSON.stringify(Jupyter.notebook.get_cell_elements().length));
  var cellsLength = Jupyter.notebook.ncells();
  var existingCode = false;
  for (var i=0; i<cellsLength; i++) {
    var currentCell = Jupyter.notebook.get_cell(i);
    var codecelltext;
    var index;

    if (currentCell instanceof codecell.CodeCell) {
      codecelltext = currentCell.get_text();
      index = codecelltext.indexOf(questions);
      if (index > -1) {
        existingCode = true;
        break;
      }
    }
  }
  //console.log(existingCode);
  return existingCode;
}

function advancedInsertToCode(data){
  //console.log('advancedInsertToCode ', data.questions);
  var cell = Jupyter.notebook.get_selected_cell();
  var prepos = cell.get_pre_cursor();
  var postpos = cell.get_post_cursor();
  var code;

  if (checkCodeDuplication(data.questions)) {

    code = data.reducedCode;
  }else {
    code = data.codeBlock;
  }
  //console.log(code);

  var index = checkPreviousOccurenceAdvanced(data.variableName) + 1;
  var newVariableName = data.variableName + index;
  var regex = new RegExp(data.variableName + '0', 'g');
  code = code.replace(regex, newVariableName);

  cell.set_text(prepos + code + postpos);
  console.log("Done loading advancedInsertToCode");
}

function pasteCred(msg) {
  var index = checkPreviousOccurence('credentials') + 1;
  var credentialsTitle ='credentials_' + index;
  var cell = Jupyter.notebook.get_selected_cell();
  var prepos = cell.get_pre_cursor();
  var postpos = cell.get_post_cursor();
  var credentials = msg.data;
  var text = credentials.replace('credentials_0',credentialsTitle);
  cell.set_text(prepos + text + postpos);
  console.log("Done loading pasteCred.V3");
}

function broadcastFinishedLoadingMessageToParent() {
  parent.postMessage('Done loading notebook.', window.origin);
  console.log("Done loading notebook.");
}

function changeKernelAutorestartingDialog () {
  Jupyter.notification_area.events.off('kernel_autorestarting.Kernel');
  Jupyter.notification_area.events.on('kernel_autorestarting.Kernel', function (evt, info) {
        var message = $('<div/>').append($('<p/>').addClass("p-space").text("Connecting to the notebook kernel " +
                            "is taking far longer than expected. The kernel will be automatically restarted."));
        var title = "Slow kernel connection";
        if (info.attempt === 1) {
            Jupyter.dialog.kernel_modal({
                notebook: Jupyter.notebook,
                keyboard_manager: Jupyter.keyboard_manager,
                title: title,
                body: message,
                buttons: {
                    OK : {
                        class : "btn-primary"
                    }
                }
            });
        }

        Jupyter.notification_area.save_widget.update_document_title();
        //knw.danger(i18n.msg._("Dead kernel"));
        $("#kernel_indicator_icon").attr('class','kernel_busy_icon');
  });
}

function changeKernelInterruptDialog() {
  Jupyter.notification_area.events.off('kernel_connection_failed.Kernel');
  Jupyter.notification_area.events.on('kernel_connection_failed.Kernel',
    function (evt, info) {
      // only show the dialog if this is the first failed
      // connect attempt, because the kernel will continue
      // trying to reconnect and we don't want to spam the user
      // with messages
      if (info.attempt === 1) {
        var msg = "Reconnecting...";

        var the_dialog = Jupyter.dialog.kernel_modal({
          title: "Connection failed",
          body: msg,
          keyboard_manager: Jupyter.keyboard_manager,
          notebook: Jupyter.notebook,
          buttons: {
            "OK": {}
          }
        });

        // hide the dialog on reconnect if it's still visible
        var dismiss = function () {
            the_dialog.modal('hide');
        }
        Jupyter.notification_area.events.on("kernel_connected.Kernel", dismiss);
        the_dialog.on("hidden.bs.modal", function () {
            // clear handler on dismiss
            Jupyter.notification_area.events.off("kernel_connected.Kernel", dismiss);
        });
      }

      if (info.attempt === 4) {

        var msg =
          "Couldn't connect. The notebook might have been deactivated after being inactive. " +
          "Reload the page to reactivate it.";

        Jupyter.dialog.kernel_modal({
          title: "Connection failed",
          body: msg,
          keyboard_manager: Jupyter.keyboard_manager,
          notebook: Jupyter.notebook,
          buttons: {
            "OK": {}
          }
        });
      }
    });

    Jupyter.notification_area.events.on('kernel_dead.Session',
    function (evt, info) {
        var msg = info.xhr.responseJSON.message || 'Kernel Error';
        Jupyter.dialog.kernel_modal({
          title: "Failed to start the kernel",
          body: msg,
          keyboard_manager: Jupyter.keyboard_manager,
          notebook: Jupyter.notebook,
          buttons: {
            "Ok": { class: 'btn-primary' }
          }
        });
    });
  console.log("Done loading custom dialogs.");
}

function replaceDownloadAsIpynb() {
  Jupyter.menubar.element.find('#download_ipynb').off("click").click(function () {
    if (Jupyter.menubar.notebook.dirty) {
      Jupyter.menubar.notebook.save_notebook({
        async: false
      });
    }
    Jupyter.menubar._nbconvert('notebook', true);
  });
  console.log("Done loading Download as ipynb replacement.");
}

function replaceRestoreCheckpointDialog(moment) {
    // Jupyter.notification_area.events.off('checkpoint_created.Notebook')
    Jupyter.notification_area.events.on('checkpoint_created.Notebook', function (evt, data) {
        var msg = "Version created";
        if (data.last_modified) {
            var d = new Date(data.last_modified);
            msg = msg + ": " + moment(d).format("HH:mm:ss");
        }
        var options = {};
        options.class = 'ax_notebook_saved';
        Jupyter.notification_area.widget('notebook').set_message(msg, 2000, null, options);
        send_event_message_to_parent('notebookUI.versionCreated')
    });
    Jupyter.menubar.update_restore_checkpoint = function(checkpoints) {
        checkpoints = _sort_checkpoint(checkpoints)
        var ul = Jupyter.menubar.element.find("#restore_checkpoint").find("ul");
        ul.empty();
        if (!checkpoints || checkpoints.length === 0) {
            ul.append(
                $("<li/>")
                .addClass("disabled")
                .append(
                    $("<a/>")
                    .text("No versions")
                )
            );
            return;
        }

        var that = Jupyter.menubar;
        checkpoints.map(function (checkpoint) {
            var d = new Date(checkpoint.last_modified);
            ul.append(
                $("<li/>").append(
                    $("<a/>")
                    .attr("href", "#")
                    .text(moment(d).format("DD MMM YYYY hh:mma"))
                    .click(function () {
                        _restore_checkpoint_dialog(checkpoint, moment);
                    })
                )
            );
        });
    };
}
function _sort_checkpoint(checkpoints) {
    checkpoints.sort(function(a,b) {return (a.last_modified > b.last_modified) ? -1 : ((b.last_modified > a.last_modified) ? 1 : 0);} );
    checkpoints = checkpoints.slice(0,10)
    return checkpoints
}

function _restore_checkpoint_dialog(checkpoint, moment) {
    var that = Jupyter.menubar.notebook;
    checkpoint = checkpoint || Jupyter.menubar.notebook.last_checkpoint;
    if ( ! checkpoint ) {
        console.log("restore dialog, but no checkpoint to restore to!");
        return;
    }
    var body = $('<div/>').append(
        $('<p/>').addClass("p-space").text(
            "Are you sure you want to revert the current notebook content to the selected version?"
        )
    ).append(
        $('<p>').addClass("p-space").text("The version you want to revert to was created on ").append(
        $('<font style="font-weight: 600; color: #152934"/>').text(moment(checkpoint.last_modified).format('D MMMM YYYY, hh:mm A.'))) //Format:  27 January 2015, 12:15 PM
    ).append(
        $('<p/>').addClass("p-space").text("This action overwrites the current content in your notebook and cannot be undone.")
    );

    Jupyter.dialog.modal({
        notebook: Jupyter.menubar.notebook,
        keyboard_manager: Jupyter.menubar.notebook.keyboard_manager,
        title : "Revert notebook",
        body : body,
        buttons : {
            Revert : {
                class : "btn-danger",
                click : function () {
                    that.restore_checkpoint(checkpoint.id);
                }
            },
            Cancel : {}
            }
    });
}

function loadCustomMethods() {
  Jupyter.notebook.events.on('kernel_ready.Kernel', function(){
    Jupyter.notebook.session.kernel._handle_input_request = function (request) {
          var header = request.header;
          var content = request.content;
          var metadata = request.metadata;
          var msg_type = header.msg_type;
          if (msg_type !== 'input_request') {
              console.log("Invalid input request!", request);
              return;
          }
          /**AX BEGIN**/
          try {
            if (content.prompt === 'ibm.ax.token') {
                Jupyter.notebook.session.kernel.send_input_reply('ibm.ax.token.reply');
                return;
            } else if (content.prompt === 'ibm.ax.orgid') {
                Jupyter.notebook.session.kernel.send_input_reply('ibm.ax.orgid.reply');
                return;
            } else if (content.prompt === 'ibm.ax.blueid') {
                Jupyter.notebook.session.kernel.send_input_reply('ibm.ax.blueid.reply');
                return;
            } else if (content.prompt === 'ibm.ax.blueid.refresh') {
                Jupyter.notebook.session.kernel.send_input_reply('ibm.ax.blueid.refresh.reply');
                return;
            } else if (content.prompt === 'ibm.ax.projectid') {
                Jupyter.notebook.session.kernel.send_input_reply('ibm.ax.projectid.reply');
                return;
            } else if (content.prompt === 'ibm.ax.notebookid') {
                Jupyter.notebook.session.kernel.send_input_reply('ibm.ax.notebookid.reply');
                return;
            }
          } catch (err) {
            console.log('Token or org_id functionality does not work properly');
          }
          /**AX END**/

          var callbacks = Jupyter.notebook.session.kernel.get_callbacks_for_msg(request.parent_header.msg_id);
          if (callbacks) {
              if (callbacks.input) {
                  callbacks.input(request);
              }
          }};
  });
  console.log('token and orgid support integrated');

  Jupyter.notebook.events.on('kernel_created.Session', function(){
    var utils = requirejs('base/js/utils');
    Jupyter.notebook.session.kernel.start_channels = function () {
        /**
         * Start the websocket channels.
         * Will stop and restart them if they already exist.
         *
         * @function start_channels
         */
        var that = Jupyter.notebook.session.kernel;
        Jupyter.notebook.session.kernel.stop_channels();
        var ws_host_url = Jupyter.notebook.session.kernel.ws_url + Jupyter.notebook.session.kernel.kernel_url;

        console.log("Starting WebSockets:", ws_host_url);
        var projectid = getUrlParameter("projectid");
        var project = getUrlParameter("project");
        var api_version = getUrlParameter("api");
        var instanceid = getUrlParameter("service");
        var env = getUrlParameter("env");
        var notebookid = Jupyter.notebook.notebook_path.replace('/', '');
        var ws_url_array = [
                  that.ws_url,
                  utils.url_join_encode(that.kernel_url, 'channels'),
                  "?session_id=" + that.session_id
              ];
        if (projectid != false){
            ws_url_array.push("&projectid=" + projectid);
        }
        if (project != false){
            ws_url_array.push("&project=" + project);
        }
        if (notebook != false){
            ws_url_array.push("&notebookid=" + notebookid);
        }
        if (instanceid != false){
            ws_url_array.push("&service=" + instanceid);
        }
        if (api_version != false){
            ws_url_array.push("&api=" + api_version);
        }
        if (env != false){
            ws_url_array.push("&env=" + env);
        }
        Jupyter.notebook.session.kernel.ws = new Jupyter.notebook.session.kernel.WebSocket(ws_url_array.join('')
        );
        console.log(ws_url_array.join(''))
        var already_called_onclose = false; // only alert once
        var ws_closed_early = function(evt){
            if (already_called_onclose){
                return;
            }
            already_called_onclose = true;
            if ( ! evt.wasClean ){
                // If the websocket was closed early, that could mean
                // that the kernel is actually dead. Try getting
                // information about the kernel from the API call --
                // if that fails, then assume the kernel is dead,
                // otherwise just follow the typical websocket closed
                // protocol.
                that.get_info(function () {
                    that._ws_closed(ws_host_url, false);
                }, function () {
                    that.events.trigger('kernel_dead.Kernel', {kernel: that});
                    that._kernel_dead();
                });
            }
        };
        var ws_closed_late = function(evt){
            if (already_called_onclose){
                return;
            }
            already_called_onclose = true;
            console.log("EVENT CODE "+evt.code)
            if (evt.code === 1011){
                console.log("EVENT CODE "+evt.code)
                that.stop_channels();
                that.events.trigger('kernel_disconnected.Kernel', {kernel: that})

                var computeType = getComputeType(true);
                var msg;
                if (computeType === COMPUTE_TYPE_IAE || computeType === COMPUTE_TYPE_WCE) {
                    msg = $('<div/>').append(
                      $('<p/>').addClass("p-space").text(
                        "No connection can be established between the notebook server and the IBM Analytics Engine (IAE) cluster. " +
                        "To reactivate the kernel, click ").append($('<font style="font-weight:bold"/>').text("Kernel > Reconnect")).append(
                        " from the notebook menu bar. ").append("If the problem persists, please contact DSX support on Intercom (bottom right corner of this page)"));
                } else if (computeType === COMPUTE_TYPE_AWS) {
                    msg = $('<div/>').append(
                      $('<p/>').addClass("p-space").text(
                        "No connection can be established between the notebook server and the Amazon EMR Spark cluster. " +
                        "Check that the Amazon EMR Spark service and the Kernel Gateway are running. " +
                        "To reactivate the kernel, click ").append($('<font style="font-weight:bold"/>').text("Kernel > Reconnect")).append(
                        " from the notebook menu bar."));
                }

                Jupyter.dialog.kernel_modal({
                  title: "Kernel Gateway connection failed",
                  body: msg,
                  keyboard_manager: Jupyter.keyboard_manager,
                  notebook: Jupyter.notebook,
                  buttons: {
                    "OK": {}
                  }
                });
            } else if ( ! evt.wasClean ){
                that._ws_closed(ws_host_url, false);
            }
        };
        var ws_error = function(evt){
            if (already_called_onclose){
                return;
            }
            already_called_onclose = true;
            that._ws_closed(ws_host_url, true);
        };

        Jupyter.notebook.session.kernel.ws.onopen = $.proxy(Jupyter.notebook.session.kernel._ws_opened, Jupyter.notebook.session.kernel);
        Jupyter.notebook.session.kernel.ws.onclose = ws_closed_early;
        Jupyter.notebook.session.kernel.ws.onerror = ws_error;
        // switch from early-close to late-close message after 1s
        setTimeout(function() {
            if (that.ws !== null) {
                that.ws.onclose = ws_closed_late;
            }
        }, 1000);
        Jupyter.notebook.session.kernel.ws.onmessage = $.proxy(Jupyter.notebook.session.kernel._handle_ws_message, Jupyter.notebook.session.kernel);
    };
  });
 }

var getUrlParameter = function (param){
    var query = window.location.search.substring(1);
    var params = query.split("&");
    for (var i=0;i<params.length;i++) {
           var parameter = params[i].split("=");
           if(parameter[0] == param){return parameter[1];}
    }
    return(false);
};

//-------------------------------------------
//--------Project Lib Events Handler --------
//-------------------------------------------
function registerProjectLibSegmentHandler() {
	try {
		Jupyter.notebook.kernel.register_iopub_handler(PROJECT_LIB_SEGMENTATION_EVENT, function(msg) {
			if (msg && (typeof msg === 'object') && msg.content && (typeof msg.content === 'object')) {
				var payload = Object.assign(msg.content, { notebookId: getNotebookId() });
				sendSegmentEventFromIframe('NB Project Lib', payload);
			}
		});
	} catch (e) {
		console.warn('Something went wrong while registering handler to catch project lib msgs!');
		console.warn(e);
	}
}

//-------------------------------------------
//--------Spark Monitoring Handler-----------
//-------------------------------------------
function registerSparkMonitorHandler() {
  if (CDSXAX &&
      CDSXAX.SparkJobMonitorHandler &&
      CDSXAX.SparkJobMonitorHandler.registerSparkMonitorMessageHandler) {
    // Register spark monitor message handler
    CDSXAX.SparkJobMonitorHandler.registerSparkMonitorMessageHandler();
  } else {
    window.console.error('Spark Monitor Handler is not available!');
  }
}

function executeCellHandler(eventData, cellInfo) {
  if (CDSXAX &&
      CDSXAX.SparkJobMonitorHandler) {
    if (CDSXAX.SparkJobMonitorHandler.getCellElement) {
      if (cellInfo && cellInfo.cell) {
        var $cellElem = CDSXAX.SparkJobMonitorHandler.getCellElement(cellInfo.cell);
        CDSXAX.SparkJobMonitorHandler.clearTableAnchor($cellElem);
      }
    }

    if (CDSXAX.SparkJobMonitorHandler.clearUnusedExecDict) {
      CDSXAX.SparkJobMonitorHandler.clearUnusedExecDict();
    }
  }
}

function clearSparkTableHandler(e, cellOutput) {
  if (cellOutput &&
      cellOutput.wrapper &&
      cellOutput.wrapper.length) {
    // get cell state div. State cell not defined, it returns input div
    var $cellState = cellOutput.wrapper.prev();
    if (!$cellState || !$cellState.length) {
      return;
    }

    // get cellKey (execId), returns undefined if cellKey is not set (covers the input section div case)
    var execId = $cellState.attr('cellKey');
    if (execId &&
        CDSXAX &&
        CDSXAX.SparkJobMonitorHandler) {
      CDSXAX.SparkJobMonitorHandler.clearSparkTable($cellState, execId);
    }
  }
}

function loadNotebookSuccesshandler(e, notebookObj, args) {
  if (args && args.length) {
    var data = args[0];
    var sparkMonitorEnabled = true;
    if (data && (typeof data.sparkMonitorEnabled !== 'undefined')) {
      sparkMonitorEnabled = data.sparkMonitorEnabled;
      console.log('Notebook Spark Monitor State:' + sparkMonitorEnabled);
    }

    if (CDSXAX &&
        CDSXAX.SparkJobMonitorHandler) {
      // set init state
      CDSXAX.SparkJobMonitorHandler.updateInitState(sparkMonitorEnabled);
    }
  }
}

var CDSXAX = CDSXAX || {};

CDSXAX.SparkJobMonitorHandler = (function ($) {
  var

  _con = window.console,
  _loggerPreFix = 'Spark Monitoring: ',
  _sparkJobsDict = {},
  _initState,
  _monitoringActive, //  undefined by default.
  _previousExecId = null,
  _cellTableAnchor = '.cell_state',
  _sparkMonitoringInputMessageId = 'spark_monitor_msg',
  _jobStartChannel = 'jobStart',
  _stageSubmittedChannel = 'stageSubmitted',
  _taskStartChannel = 'taskStart',
  _taskEndChannel = 'taskEnd',
  _stageCompletedChannel = 'stageCompleted',
  _jobEndChannel = 'jobEnd',

  // Stage states
  _stageRunningState = 'Running',
  _stageSkippedState = 'Skipped',
  _stageCompletedState = 'Completed',
  _stagePendingState = 'Pending',
  _stageFailureState = 'Failed',
  _stageStoppedState = 'Stopped',

  //-----------------------------------------
  //-----------------logger------------------
  //-----------------------------------------
  _logger = function (func, msg, dataTitle, data) {
    if (func && _con[func] &&
        (typeof _con[func] === 'function')) {
      _con[func](_loggerPreFix + msg);
      if (dataTitle && data) {
        _con[func](dataTitle + ':');
        _con[func](data);
      }
    }
  },

  _logWarning = function (msg, dataTitle, data) {
    _logger('warn', msg, dataTitle, data);
  },

  _logError = function (msg, dataTitle, data) {
    _logger('error', msg, dataTitle, data);
  },

  //-----------------------------------------
  //----------spark job dict helpers---------
  //-----------------------------------------
  _isInitStateAvailable = function () {
    return (typeof _initState !== 'undefined');
  },

  _updateInitState = function (initState) {
    _initState = initState;

    // if feature is enabled, update UI and state accordingly
    if (_isSparkMonitorDefined()) {
      _enableSparkMonitorFeature(_initState);
    }
  },

  _getInitState = function () {
    return _initState;
  },

  _isSparkMonitorActive = function() {
    return _monitoringActive;
  },

  _isSparkMonitorDefined = function () {
    return (typeof _monitoringActive !== 'undefined');
  },

  _setFeatureActivation = function (activationParam) {
    _monitoringActive = activationParam;
  },

  _switchSparkMonitorActivation = function () {
    _monitoringActive = !_monitoringActive;
  },

  _isDirty = function (execId) {
    return (_sparkJobsDict[execId] && _sparkJobsDict[execId].dirty);
  },

  _setClean = function (execId) {
    if (_sparkJobsDict[execId]) {
      _sparkJobsDict[execId].dirty = false;
    }
  },

  _setDirty = function (execId) {
    if (_sparkJobsDict[execId]) {
      _sparkJobsDict[execId].dirty = true;
    }
  },

  _isObsolete = function (execId) {
    return (_sparkJobsDict[execId] && _sparkJobsDict[execId].obsolete);
  },

  _setObsolete = function (execId) {
    if (_sparkJobsDict[execId]) {
      _sparkJobsDict[execId].obsolete = true;
    }
  },

  _getPreviousExecId = function () {
    return _previousExecId;
  },

  _checkExecIdExist = function (execId) {
    return _sparkJobsDict[execId];
  },

  _getNumOfDictEntries = function () {
    var count = 0;
    for (var prop in _sparkJobsDict) {
      if (_sparkJobsDict.hasOwnProperty(prop)) {
        count++;
      }
    }
    return count;
  },

  _addExecIdExists = function (execId) {
    _previousExecId = execId;
    if (!_checkExecIdExist(execId)) {
      _sparkJobsDict[execId] = {
        execId: execId,
        jobs: []
      };
    }
  },

  _clearUnusedExecDict = function () {
    for (var prop in _sparkJobsDict) {
      if (_sparkJobsDict.hasOwnProperty(prop) &&
         ((!_getTargetCellFromMsg(prop)) || _isObsolete(prop))) {
        delete _sparkJobsDict[prop];
      }
    }
  },

  _obsoleteAllSparkDictEntries = function () {
    for (var prop in _sparkJobsDict) {
      if (_sparkJobsDict.hasOwnProperty(prop)) {
        _setObsolete(prop);
        _setDirty(prop);
      }
    }
  },

  _setAllDictDirty = function () {
    for (var prop in _sparkJobsDict) {
      if (_sparkJobsDict.hasOwnProperty(prop)) {
        _setDirty(prop);
      }
    }
  },

  _getNumOfActiveSparkDicts = function () {
    // clean up dict to get the latest state
    _clearUnusedExecDict();

    // getNumber of dicts
    return _getNumOfDictEntries();
  },

  _addJobToDict = function (execId, jobObj) {
    if (!_checkExecIdExist(execId)) {
      return;
    }

    var execDict = _getExecDataFromDict(execId);

    // This is for job re-submission attempts
    // check if job already exists there
    var existingJob = _getJobFromDict(execId, jobObj.jobId);
    if (!existingJob) {
      execDict.jobs.push(jobObj);
    } else {
      existingJob = jobObj;
    }
  },

  _getExecDataFromDict = function (execId) {
    return _sparkJobsDict[execId];
  },

  _getJobFromDict = function (execId, jobId) {
    if (!_checkExecIdExist(execId)) {
      return null;
    }

    var jobObj = null;

    var execDict = _getExecDataFromDict(execId);
    execDict.jobs.some(function (job) {
      if (job.jobId === jobId) {
        jobObj = job;
        return true;
      }
    });

    return jobObj;
  },

  _getStageFromDict = function (execId, stageId) {
    if (!_checkExecIdExist(execId)) {
      return null;
    }

    var stageTmp = null;
    var execDict = _getExecDataFromDict(execId);
    if (execDict) {
      execDict.jobs.some(function (job) {
        if (Array.isArray(job.stages)) {
          return job.stages.some(function (stage) {
            if (stage.stageId === stageId) {
              stageTmp = stage;
              return true;
            }
          });
        }
      });
    }

    return stageTmp;
  },

  _getJobFromStage = function (execId, stageId) {
    if (!_checkExecIdExist(execId)) {
      return null;
    }

    var jobObj = null;
    var execDict = _getExecDataFromDict(execId);
    if (execDict) {
      execDict.jobs.some(function (job) {
        if (Array.isArray(job.stages)) {
          return job.stages.some(function (stage) {
            if (stage.stageId === stageId) {
              jobObj = job;
              return true;
            }
          });
        }
      });
    }

    return jobObj;
  },
  // It returns the queue object (list)
  _checkForMessageQueue = function (content) {
    if (content && Array.isArray(content.data_queue)) {
      return content.data_queue;
    }
    return null;
  },

  _getCellSparkDict = function (cellId) {
    return (_sparkJobsDict[cellId] ? _sparkJobsDict[cellId] : {});
  },

  //------------------------------------
  //--------UI handlers-----------------
  //------------------------------------
  _getStateTableAnchor = function ($cell) {
    // check if the table exists
    // if so return the anchor directly
    if ($cell && $cell.length && _hasStateTable($cell)) {
      return $cell.children(_cellTableAnchor);
    }

    return null;
  },

  _clearTableAnchor = function ($cell) {
    if ($cell && $cell.length && _hasStateTable($cell)) {
      var $tableElem = $cell.children(_cellTableAnchor);
      $tableElem.remove();
    }
  },

  _renderSparkTables = function () {
    for (var prop in _sparkJobsDict) {
      if (_sparkJobsDict.hasOwnProperty(prop)) {
        var cell = _getTargetCellFromMsg(prop);
        if (cell && _isDirty(prop)) {
          _rerenderCellState(cell, prop);
          _setClean(prop);
        }
      }
    }
  },

  _rerenderCellState = function (cell, cellId) {
    var $cell = _getCellElement(cell);
    var $stateAnchor = _getStateTableAnchor($cell);
    var context = {
      cellKey: cellId,
      data: _getCellSparkDict(cellId)
    };

    if ($stateAnchor && $stateAnchor.length) {
      _renderSparkTable(context, $stateAnchor, 'replaceWith');
      return;
    }

    // add table after input section of the cell
    var $inputElem = _getInputAreaElement($cell);
    if ($inputElem && $inputElem.length) {
      _renderSparkTable(context, $inputElem, 'after');
    } else {
      _logError('unexpected cell strucutre!');
    }
  },

  _renderSparkTable = function (context, $anchor, bindingFunc) {
    if (!_isSparkMonitorActive()) {
      return;
    }

    if (CDSXAX &&
        CDSXAX.UIRenderingEngine &&
        CDSXAX.UIRenderingEngine.renderDustTemplate &&
        (typeof CDSXAX.UIRenderingEngine.renderDustTemplate === 'function')) {
      CDSXAX.UIRenderingEngine.renderDustTemplate('baseSparkProgressTable', context, function (markup) {
        if (markup) {
          if ($anchor &&
              $anchor[bindingFunc] &&
              (typeof $anchor[bindingFunc] === 'function')) {
            $anchor[bindingFunc](markup);
          }
        }
      });
    } else {
      _logError('UIRenderingEngine module can not be found! Can not produce UI components!');
    }
  },

  _updateJobUIState = function (execId, jobId) {
    var jobObj = _getJobFromDict(execId, jobId);
    if (jobObj) {
      jobObj.open = !jobObj.open;
    } else {
      _logWarning('job object is not found! Can not update job state in table!');
    }
  },

  _updateTableUIState = function (execId) {
    var dict = _getCellSparkDict(execId);
    if (dict) {
      dict.collapsed = (dict.collapsed ? !dict.collapsed : true);

      // send segment event
      if (sendSegmentEventFromIframe && (typeof sendSegmentEventFromIframe === 'function')) {
        sendSegmentEventFromIframe('NB Collapse Spark Table', {
          notebookId: _getNotebooksId(),
          numOfSparkTables: _getNumOfActiveSparkDicts(),
          action: (dict.collapsed ? 'collapse' : 'uncollapse')
        });
      }
    } else {
      _logWarning('cellKey is not found in the dict! Click event ignored!');
    }
  },

  //-------------------------------------------
  //-----------------Helpers-------------------
  //-------------------------------------------
  _roundNum = function (num) {
    return Math.round(num * 100) / 100;
  },

  _getCellElement = function (cell) {
    if (cell && cell.element && cell.element.length) {
      return cell.element;
    }
    return null;
  },

  _getInputAreaElement = function ($cell) {
    if ($cell && $cell.length) {
      return $cell.children('.input');
    }
    return null;
  },

  _hasStateTable = function ($cell) {
    return ($cell && $cell.length && $cell.has(_cellTableAnchor).length);
  },

  //------------------------------------
  //--------Message Handlers------------
  //------------------------------------
  // Add new job
  _extendStageArray = function (stageArray) {
    if (Array.isArray(stageArray)) {
      stageArray.forEach(function (stage) {
        stage.doneTasks = 0;
        stage.submittedTasks = 0;
        stage.progressPercentage = 0;
        stage.state = _stagePendingState;
      });
    }
  },

  _addJobToSparkDict = function (jobId, stageInfos, time, execId) {
    _addJobToDict(execId, {
      jobId: jobId,
      jobResult: '',
      numStages: (Array.isArray(stageInfos) ? stageInfos.length : 0),
      doneStages: 0,
      stages: stageInfos,
      progressPercentage: 0,
      open: false,
      startTime: time,
      duration: 0
    });
  },

  _addNewJobHandler = function (execId, messagePayload) {
    var jobId = messagePayload.jobId;
    var stageArray = messagePayload.stageInfos;
    var jobStartTime = messagePayload.jobTime;

    // check if valid
    if (!jobId || !jobStartTime || !(Array.isArray(stageArray))) {
      _logWarning('NewJob data is not valid! Message ignored!', 'messagePayload', messagePayload);
      return;
    }

    // check if the execution id is there
    _addExecIdExists(execId);

    //extend stage array
    _extendStageArray(stageArray);

    // add job to spark dict
    _addJobToSparkDict(jobId, stageArray, jobStartTime, execId);

    //mark dict entry as dirty
    _setDirty(execId);
  },

  // Add new stage
  _addNewStageHandler = function (execId, messagePayload, previousExec) {
    var stageId = messagePayload.stageId;

    if (!stageId) {
      _logWarning('invalid messagePayload! stageId can not be found!', 'messagePayload', messagePayload);
      return;
    }

    // get stage obj from spark dict
    var stageObj = _getStageFromDict(execId, stageId);
    if (stageObj) {
      // update stage state
      stageObj.state = _stageRunningState;
      _setDirty(execId);
    } else if (!previousExec) {
      // if the previous condition fails then the reason
      // is having data from a previous job on the cluster
      // and it is still running but the data is outdated since new execution
      // has begun

      var preExecId = _getPreviousExecId();
      if (preExecId) {
        _addNewStageHandler(preExecId, messagePayload, true);
      }
    }
  },

  // Add new task
  _addNewTaskHandler = function (execId, messagePayload, previousExec) {
    // get stageId
    var stageId = messagePayload.stageId;
    if (!stageId) {
      _logWarning('invalid messagePayload! stageId can not be found!', 'messagePayload', messagePayload);
      return;
    }

    var stageObj = _getStageFromDict(execId, stageId);
    if (stageObj) {
      stageObj.submittedTasks += 1;
      _setDirty(execId);
    } else if (!previousExec) {
      // if the previous condition fails then the reason
      // is having data from a previous job on the cluster
      // and it is still running but the data is outdated since new execution
      // has begun

      var preExecId = _getPreviousExecId();
      if (preExecId) {
        _addNewTaskHandler(preExecId, messagePayload, true);
      }
    }
  },

  // Task completed
  _taskCompleted = function (execId, messagePayload, previousExec) {
    // check if the task completed successfully
    if (!messagePayload.reason || (messagePayload.reason !== 'Success')) {
      // task failed
      return;
    }

    // get stageId
    var stageId = messagePayload.stageId;
    if (!stageId) {
      _logWarning('invalid messagePayload! stageId can not be found!', 'messagePayload', messagePayload);
      return;
    }

    var stageObj = _getStageFromDict(execId, stageId);
    if (stageObj) {
      if (stageObj.doneTasks < stageObj.numTasks) {
        stageObj.doneTasks += 1;
      }
      stageObj.progressPercentage = (stageObj.doneTasks * 100) / stageObj.numTasks;
      _setDirty(execId);
    } else if (!previousExec) {
      // if the previous condition fails then the reason
      // is having data from a previous job on the cluster
      // and it is still running but the data is outdated since new execution
      // has begun
      var preExecId = _getPreviousExecId();
      if (preExecId) {
        _taskCompleted(preExecId, messagePayload, true);
      }
    }
  },

  // Stage completed
  _updateJobForCompletedStage = function (execId, stageId) {
    var jobObj = _getJobFromStage(execId, stageId);
    if (jobObj) {
      if (jobObj.numStages > jobObj.doneStages) {
        jobObj.doneStages += 1;
        jobObj.progressPercentage = (jobObj.doneStages * 100) / jobObj.numStages;
      }
    }
  },

  _stageCompleted = function (execId, messagePayload, previousExec) {
    var stageId = messagePayload.stageId;

    if (!stageId) {
      _logWarning('invalid messagePayload! stageId can not be found!', 'messagePayload', messagePayload);
      return;
    }

    // get stage obj from spark dict
    var stageObj = _getStageFromDict(execId, stageId);
    if (stageObj) {
      // check if the stage completed successfully or it failed
      if (messagePayload.reason && messagePayload.reason === 'Success') {
        stageObj.state = _stageCompletedState;
        // increase done stages with one
        _updateJobForCompletedStage(execId, messagePayload.stageId);
      } else {
        stageObj.state = _stageFailureState;
      }
      _setDirty(execId);
    } else if (!previousExec) {
      // if the previous condition fails then the reason
      // is having data from a previous job on the cluster
      // and it is still running but the data is outdated since new execution
      // has begun
      var preExecId = _getPreviousExecId();
      if (preExecId) {
        _stageCompleted(preExecId, messagePayload, true);
      }
    }
  },

  // Job completed
  _updateLeftStagesState = function (stageList, _state) {
    if (Array.isArray(stageList)) {
      stageList.forEach(function (stage) {
        if (stage.doneTasks === 0) {
          stage.state = _state;
        }
      });
    }
  },

  _jobCompleted = function (execId, messagePayload, previousExec) {
    var jobId = messagePayload.jobId;
    var jobStartTime = messagePayload.jobTime;
    var jobResult = messagePayload.jobResult;

    // check if valid
    if (!jobId || !jobStartTime || !jobResult) {
      _logWarning('completedJob data is not valid! message ignored!', 'messagePayload', messagePayload);
      return;
    }

    // update job obj data
    var jobObj = _getJobFromDict(execId, jobId);
    if (jobObj) {
      if (jobResult && jobResult === 'Success') {
        jobObj.progressPercentage = 100;
        jobObj.duration = _roundNum((jobStartTime - jobObj.startTime) / 1000.0);
        _updateLeftStagesState(jobObj.stages, _stageSkippedState);
      } else {
        _updateLeftStagesState(jobObj.stages, _stageStoppedState);
      }
      jobObj.jobResult = jobResult;
      _setDirty(execId);
    } else if (!previousExec) {
      // if the previous condition fails then the reason
      // is having data from a previous job on the cluster
      // and it is still running but the data is outdated since new execution
      // has begun
      var preExecId = _getPreviousExecId();
      if (preExecId) {
        _jobCompleted(preExecId, messagePayload, true);
      }
    }
  },

  //----------------------------------------
  //---------Message Interpretation---------
  //----------------------------------------
  _getMsgContent = function (msg) {
    if (msg && msg.content) {
      return msg.content;
    }
    return null;
  },

  _getParentHeaderMsgId = function (msg) {
    if (msg && msg.parent_header && msg.parent_header.msg_id) {
      return msg.parent_header.msg_id;
    }
    return '';
  },

  _getTargetCellFromMsg = function (parentHeaderMsgId) {
    var cell = null;

    if (Jupyter &&
        Jupyter.notebook &&
        Jupyter.notebook.get_msg_cell &&
        (typeof Jupyter.notebook.get_msg_cell === 'function') &&
        parentHeaderMsgId) {
      return Jupyter.notebook.get_msg_cell(parentHeaderMsgId);
    } else {
      if (!parentHeaderMsgId) {
        _logWarning('parentHeaderMsgId not found!');
      } else {
        _logWarning('Jupyter.notebook.get_msg_cell not found!');
      }
    }

    return cell;
  },

  _getChannelId = function (content) {
    if (content && content.id) {
      return content.id;
    }
    return '';
  },

  _getMessageData = function (content) {
    var data = null;
    if (content && content.data) {
      try {
        data = JSON.parse(content.data);
      } catch (e) {
        _logWarning('Message data can not be parsed!');
      }
    }
    return data;
  },

  _sparkMessageInterpreter = function (channelId, messagePayload, execId) {
    // decide how to handle the message
    switch (channelId) {
      case _jobStartChannel:
        _addNewJobHandler(execId, messagePayload);
        break;
      case _stageSubmittedChannel:
        _addNewStageHandler(execId, messagePayload);
        break;
      case _taskStartChannel:
        _addNewTaskHandler(execId, messagePayload);
        break;
      case _taskEndChannel:
        _taskCompleted(execId, messagePayload);
        break;
      case _stageCompletedChannel:
        _stageCompleted(execId, messagePayload);
        break;
      case _jobEndChannel:
        _jobCompleted(execId, messagePayload);
        break;
    }
  },

  _msgContentHandler = function (content, msg, targetCell, cellId) {
    var channelId = _getChannelId(content);
    var messagePayload = _getMessageData(content);

    // Message validation
    if (!channelId || !messagePayload || !targetCell || !cellId) {
      _logWarning('strucutre of message object is not valid! Message ignored!', 'messageObj', msg);
      return;
    }

    // Interpretation phase
    _sparkMessageInterpreter(channelId, messagePayload, cellId);
  },

  _messageReceivedCallback = function (msg) {
    var content = _getMsgContent(msg);
    var cellId = _getParentHeaderMsgId(msg);
    var cell = _getTargetCellFromMsg(cellId);

    if (cellId && !cell) {
      // This case happens when a cell is being re-executed
      // and messages are still comming
      return;
    }

    var queue = _checkForMessageQueue(content);
    if (queue) {
      queue.forEach(function (sparkMsgContent) {
        _msgContentHandler(sparkMsgContent, msg, cell, cellId);
      });
      _renderSparkTables();
      return;
    }

    // one spark message
    _msgContentHandler(content, msg, cell, cellId);
    _renderSparkTables();
  },

  _registerSparkMonitorMessageHandler = function () {
    if (Jupyter &&
        Jupyter.notebook &&
        Jupyter.notebook.kernel &&
        Jupyter.notebook.kernel.register_iopub_handler &&
        typeof Jupyter.notebook.kernel.register_iopub_handler === 'function') {
      Jupyter.notebook.kernel.register_iopub_handler(_sparkMonitoringInputMessageId, _messageReceivedCallback);
    } else {
      _logError('Kernel object or registering handler is not available!');
    }
  },

  ////////////////////////////////
  /////// AJAX Calls /////////////
  ////////////////////////////////
  _getBaseURL = function () {
    return ((Jupyter &&
            Jupyter.menubar &&
            Jupyter.menubar.notebook &&
            Jupyter.menubar.notebook.base_url) ? Jupyter.menubar.notebook.base_url : '');
  },

  _getNotebooksId = function () {
    return ((Jupyter &&
             Jupyter.notebook &&
             Jupyter.notebook.notebook_path) ? Jupyter.notebook.notebook_path.replace('/', '') : '');
  },

  _getSparkMonitorEndpointUrl = function () {
    var utils = requirejs('base/js/utils');
    var baseUrl = _getBaseURL();
    var notebooksId = _getNotebooksId();
    return utils.url_join_encode(baseUrl, 'api', 'ax', 'notebooks', notebooksId);
  },

  _persistSparkMonitorState = function (newState) {
    var endPointUrl = _getSparkMonitorEndpointUrl();
    console.log('Send spark monitor persist request:' + endPointUrl);
    return $.ajax({
      url: endPointUrl,
      method: 'PATCH',
      data: '{ "sparkMonitorEnabled": ' + newState + ' }'
    });
  },

  ////////////////////////////////
  /////// UI Handlers ////////////
  ////////////////////////////////
  // This finction show or hide spark tables on change of
  // the activation of the feature.
  _updateTablesUIOnFeatureActivationChange = function (featureActivated) {
    if (featureActivated) {
      // render spark dict into spark tables
      _setAllDictDirty();
      _renderSparkTables();
    } else {
      // clear all tables from the UI
      _clearAllTablesFromUI();
    }
  },

  // This function changes the visual state of the top menu button
  _updateSparkMonitorButtonState = function (featureActivated) {
    var $sparkMonitorButton = $('#spark_monitor_activation');
    if ($sparkMonitorButton && $sparkMonitorButton.length) {
      var newState;
      var $useAnchor = $sparkMonitorButton.find('use');

      // check if monitoring active or not
      if (featureActivated) {
        newState = '#icon_spark_monitor_button';
      } else {
        newState = '#icon_spark_monitor_button_inactive';
      }

      //  bind the right icon
      if ($useAnchor && $useAnchor.length) {
        $useAnchor.attr('xlink:href', newState);
      }
    }
  },

  // This function switches the state of spark monitor in the whole notebook
  // (activate/deactivate spark monitoring in a notebook) based on the input param active
  // if active is not defined, the function switches the state
  _enableSparkMonitorFeature = function (active) {
    var featureActivated;

    if (typeof active === 'undefined') {
      // switch state of spark monitor
      featureActivated = !_isSparkMonitorActive();
    } else {
      featureActivated = active;
    }

    // activate feature
    _setFeatureActivation(featureActivated);

    // update tables UI
    _updateTablesUIOnFeatureActivationChange(featureActivated);

    // update button UI
    _updateSparkMonitorButtonState(featureActivated);
  },

  _enableSparkMonitorFeatureWithInitState = function (defaultActiveValue) {
    var enabled = defaultActiveValue;
    if (_isInitStateAvailable()) {
      enabled = _getInitState();
    }

    _enableSparkMonitorFeature(enabled);
  },

  // This function is to clear all tables from the UI
  // the function doesn't modify the spark dict object
  _clearAllTablesFromUI = function () {
    var $tablesUIList = $('.cell_state');
    if ($tablesUIList && $tablesUIList.length) {
      $tablesUIList.each(function (index, table) {
        var $table = $(table);
        $table.remove();
      });
    }
  },

  // This function is exposed to the outside to be hocked up
  // to the event when a cell output is cleared
  // This function clear the table UI and update spark dict
  _clearSparkTable = function ($cellState, execId) {
    // mark table entry as obsolete in the spark dict
    _setObsolete(execId);
    _setDirty(execId);

    // prepare context for rendering
    var context = {
      cellKey: execId,
      data: _getCellSparkDict(execId)
    };

    // render table
    // this rerendering will remove the table from the UI since obsolete flag is set
    _renderSparkTable(context, $cellState, 'replaceWith');

    //update spark dict variable to clear up the obsolete entries
    _clearUnusedExecDict();
  },

  _sparkTableClickHandler = function (e) {
    if (!e || !e.currentTarget) {
      _logWarning('something wrong with the jquery event!');
      return;
    }

    // get parent cell for cellKey
    var $elem = $(e.currentTarget);
    var $cellKey = $elem.closest('.cell_state');
    if ($cellKey.length === 0) {
      _logWarning('cell_state parent node is not found or more than one got returned!');
      return;
    }

    var cellKey = $cellKey.attr('cellkey');
    if (!cellKey) {
      _logWarning('cellKey was not found!');
      return;
    }

    if ($elem.hasClass('job_row')) {
      var jobId = $elem.attr('jobid');

      if (!jobId) {
        _logWarning('needed attributes for job row click event were not found!');
        return;
      }

      // Update job data in spark dict
      _updateJobUIState(cellKey, jobId);
    } else if ($elem.hasClass('upper_header')) {
      // update table UI state
      _updateTableUIState(cellKey);
    }

    // rerender table
    var context = {
      cellKey: cellKey,
      data: _getCellSparkDict(cellKey)
    };

    _renderSparkTable(context, $cellKey, 'replaceWith');
  },

  _registerMonitoringUIHandlers = function () {
    $('#notebook').on('click', '.clickable_section', _sparkTableClickHandler);
  },

  _init = function () {
    _registerMonitoringUIHandlers();
  };

  _init();

  return {
    registerSparkMonitorMessageHandler: _registerSparkMonitorMessageHandler,
    enableSparkMonitorFeature: _enableSparkMonitorFeature,
    enableSparkMonitorFeatureWithInitState: _enableSparkMonitorFeatureWithInitState,
    isInitStateAvailable: _isInitStateAvailable,
    updateInitState: _updateInitState,
    isSparkMonitorActive: _isSparkMonitorActive,
    getCellElement: _getCellElement,
    clearTableAnchor: _clearTableAnchor,
    clearUnusedExecDict: _clearUnusedExecDict,
    clearSparkTable: _clearSparkTable,
    persistSparkMonitorState: _persistSparkMonitorState,
    getNumOfActiveSparkDicts: _getNumOfActiveSparkDicts,
    getSparkMonitorEndpointUrl: _getSparkMonitorEndpointUrl
  };
})($);

CDSXAX.UIRenderingEngine = (function ($) {
  //------------------------------------
  //--------CLIENT SIDE RENDERING-------
  //------------------------------------
  var

  _con = window.console,

  _renderTemplate = function (template, context, callback) {
    if (typeof dust !== 'undefined') {
      dust.render(template, context, callback);
    } else {
      callback('dust engine is not available!');
      return;
    }
  },

  _renderDustTemplate = function (template, context, callback) {
    _renderTemplate(template, context, function (err, markup) {
      if (err) {
        _con.error('UI Rendering Engine: ' + err);
        callback(null);
        return;
      }

      callback(markup);
    });
  };

  return {
    renderDustTemplate: _renderDustTemplate
  };
})($);
//-----------------------------------------------
//--------End Spark Monitoring Handler-----------
//-----------------------------------------------

//-----------------------------------------
//-------- FE Customization ---------------
//-----------------------------------------
CDSXAX.jupyterObjectCustomizer = (function () {
  var

  //////////////////////////
  /////// Variables ////////
  //////////////////////////
  _globalEvents = null,
  _con = window.console,

  //////////////////////////
  /////// Handlers /////////
  //////////////////////////
  _checkValidEventsObject = function () {
    return (_globalEvents &&
            _globalEvents.trigger &&
            (typeof _globalEvents.trigger === 'function'));
  },

  _getReplacementFunction = function (events, func, eventTitle) {
    return function () {
      events.trigger(eventTitle, [((typeof this !== 'undefined') ? this : null), arguments]);
      return func.apply(this, arguments);
    };
  },

  _extendFunctionWithEvent = function (baseObj, funcName, eventTitle) {
    if (_checkValidEventsObject()) {
      baseObj[funcName] = _getReplacementFunction(_globalEvents, baseObj[funcName], eventTitle);
    } else {
      _con.error('jupyterObjectCustomizer: the module is not initialized!');
    }
  },

  _init = function (events) {
    _globalEvents = events;
  };

  return {
    init: _init,
    extendFunctionWithEvent: _extendFunctionWithEvent
  };
})();

///////////////////////////////////
///// Customization Handlers //////
///////////////////////////////////
// This function extends the outputarea by adding an instruction
// to trigger an event
function extendClearCellOutputFunction(outputarea) {
  if (CDSXAX &&
      CDSXAX.jupyterObjectCustomizer &&
      outputarea &&
      outputarea.OutputArea &&
      outputarea.OutputArea.prototype) {
    CDSXAX.jupyterObjectCustomizer.extendFunctionWithEvent(outputarea.OutputArea.prototype, 'clear_output', 'custom.clear_cell_output');
  }
}

function extendLoadNotebookSuccessFunction(notebook) {
  if (CDSXAX &&
      CDSXAX.jupyterObjectCustomizer &&
      notebook &&
      notebook.Notebook &&
      notebook.Notebook.prototype) {
    CDSXAX.jupyterObjectCustomizer.extendFunctionWithEvent(notebook.Notebook.prototype, 'load_notebook_success', 'custom.load_notebook_success');
  }
}

function _initCustomGlobalObjExtensions(events, outputarea, notebook) {
  // initalize jupyterObjectCustomizer
  if (CDSXAX &&
      CDSXAX.jupyterObjectCustomizer) {
    CDSXAX.jupyterObjectCustomizer.init(events);
  }

  // section to add custom function extensions
  // extend clear output area
  extendClearCellOutputFunction(outputarea);

  // extend load_notebook_success function in notebook object
  // to add custom event
  extendLoadNotebookSuccessFunction(notebook);
}

function _fetch_spark_monitoring_state() {
  function _fetch_metadata_from_server() {
    var endpointUrl = CDSXAX.SparkJobMonitorHandler.getSparkMonitorEndpointUrl();
    console.log('Fetching spark monitor state... url:' + endpointUrl);
    return $.ajax({
      url: endpointUrl,
      method: 'GET',
      cache: false
    });
  }

  function _successHandlerForSparkMonitor(data) {
    var sparkMonitorEnabled = true;
    if ((typeof data === 'object') &&
        (typeof data.spark_monitor === 'object') &&
        (typeof data.spark_monitor.enabled === 'boolean')) {
      sparkMonitorEnabled = data.spark_monitor.enabled;
    } else {
      console.error('spark monitor initial state can not be detected! unexpected data format received! Monitor enabled by default.');
    }

    CDSXAX.SparkJobMonitorHandler.updateInitState(sparkMonitorEnabled);
  }

  function _failerHandler(jqXHR) {
    console.error('Error fetching Monitor state! Error status:');
    if (jqXHR && jqXHR.status) {
      console.log(jqXHR.status);
    }
  }

  _fetch_metadata_from_server()
    .done(_successHandlerForSparkMonitor)
    .fail(_failerHandler);
}
//-------------------------------------------
//-------- End FE Customization -------------
//-------------------------------------------


var KernelConnectionMonitor = function (keyboard_manager) {
    this.events = requirejs('base/js/events');
    this.notebook = notebook;
    this.keyboard_manager = keyboard_manager;
    this.computeType = getComputeType(true);
}

KernelConnectionMonitor.prototype.addEventListeners = function (timeout) {
    var that = this;
    var timeoutEvent = null;
    var message = $('<div/>').append($('<p/>').addClass("p-space").text("Connecting to the notebook kernel " +
                    "is taking far longer than expected. The kernel will be automatically restarted."));
    if (that.computeType === COMPUTE_TYPE_IAE || that.computeType === COMPUTE_TYPE_WCE) {
      message = $('<div/>').append($('<p/>').addClass("p-space").text(
          "Connecting to the notebook kernel running on a IBM Analytics Engine (IAE) cluster is taking longer than expected or might have failed.  " +
          "To reconnect your notebook to the kernel click ").append($('<font style="font-weight:bold"/>').text("Kernel > Reconnect")).append(
          ". If the issue persists, please contact DSX support on Intercom (bottom right corner of this page)."));
    } else if (that.computeType === COMPUTE_TYPE_AWS) {
      message = $('<div/>').append($('<p/>').addClass("p-space").text(
        "Connecting to the notebook kernel on Amazon EMR is taking longer than expected or might have failed.  " +
        "Check that the Kernel Gateway to Amazon EMR is accessible and started, and that your service has  " +
        "enough Spark resources. For details about how to fix these issues, " +
        "see ").append($('<a target="_blank" href= "https://apsportal.ibm.com/docs/content/getting-started/known-issues.html"/>').text("Known issues")));
    }

    if (that.computeType === COMPUTE_TYPE_IAE || that.computeType === COMPUTE_TYPE_WCE || that.computeType === COMPUTE_TYPE_AWS) {
        that.events.on("notebook_loaded.Notebook", function() {
            clearTimeout(timeoutEvent);
            var title = "Kernel Gateway connection failed";
            timeoutEvent = setTimeout(function() {that.displayFailedKernelDialog(title, message)}, timeout);});
        that.events.on("kernel_connected.Kernel", function() {
            clearTimeout(timeoutEvent);
            var title = "No connection to notebook kernel";
            timeoutEvent = setTimeout(function() {that.displayFailedKernelDialog(title, message)}, timeout);});
        that.events.on("kernel_ready.Kernel", function() {
            clearTimeout(timeoutEvent);
            send_event_message_to_parent(notebookuiPrefix+".kernel_ready");
        });
    } else {
        that.events.on("kernel_created.Session", function() {
            console.log("Starting Kernel Connection Monitor");
            clearTimeout(timeoutEvent);
            var title = "Slow kernel connection";
            timeoutEvent = setTimeout(function() {that.stop_and_start_kernel(title, message)}, timeout);
            });
        that.events.on("kernel_ready.Kernel kernel_killed.Kernel kernel_killed.Session", function() {
            console.log("Kernel Monitor stopped.");
            clearTimeout(timeoutEvent);
            });

        that.events.on("kernel_ready.Kernel", function() {
            send_event_message_to_parent(notebookuiPrefix+".kernel_ready");
         });
    }
}

KernelConnectionMonitor.prototype.displayDialog = function (title, message) {
    var dialog = requirejs("base/js/dialog");
    dialog.kernel_modal({
      title: title,
      body: message,
      keyboard_manager: Jupyter.keyboard_manager,
      notebook: Jupyter.notebook,
      buttons: {
        "Ok": { class: 'btn-primary' }
      }
    });
}

KernelConnectionMonitor.prototype.displayFailedKernelDialog = function (title, message) {

    var that = this;

    var success = function (data, status, xhr) {
        if (data.hasOwnProperty("execution_state") && data["execution_state"] === "starting") {
            console.log("Kernel in starting state");
            if (that.computeType === COMPUTE_TYPE_IAE || that.computeType === COMPUTE_TYPE_WCE) {
                title = "Notebook kernel not responding";
                message = $('<div/>').append($('<p/>').addClass("p-space").text(
                  "Connecting to the notebook kernel running on a IBM Analytics Engine service is taking longer than expected or might have failed.  " +
                  "Check that the service instance has enough resources for starting a new notebook kernel. Stop any notebook kernels running on the " +
                  "same service that are not required at the moment. You can contact our support by clicking the chat icon in the lower-right corner of this page."));
            }
            that.displayDialog(title, message);
        }
        console.log("Kernel in " + data["execution_state"] +" state");
    }

    var error = function (xhr, status, err) {
        console.log("Error requesting kernel info: " + status);
    }

    if (Jupyter.notebook.kernel !== null) {
        Jupyter.notebook.kernel.get_info(success, error);
    } else {
        if (that.computeType === COMPUTE_TYPE_IAE || that.computeType === COMPUTE_TYPE_WCE) {
            title = "Kernel Gateway Connection Failed"
            message = $('<div/>').append($('<p/>').addClass("p-space").text(
              "Connecting to the notebook kernel running on the IBM Analytics Engine service is taking longer than expected or might have failed. " +
              "Check that the service instance is in ").append($('<font style="font-weight:bold"/>').text("Active")).append(
              " state (take me to ").append($("<a target=\"_blank\" href=https://console.bluemix.net/dashboard/apps>IBM Cloud Dashboard</a>")).append("). You can contact our support by clicking the chat icon in the lower-right corner of this page."));
        }
        that.displayDialog(title, message);
    }
}

KernelConnectionMonitor.prototype.insert_project_parameters = function (message) {
    try {
        var kernel_name = Jupyter.notebook.session.kernel_model.name;
        var kernel = Jupyter.notebook.kernel || "";
        var that = this;
        var language_name = Jupyter.kernelselector.kernelspecs[kernel_name].spec.language || "";
        var command = "";
        if (language_name.toLowerCase() === 'python') {
            command = "import os \n";
             for (var name in message) {
                if(name.toLowerCase().indexOf('project_')>-1 && message.hasOwnProperty(name) && message[name].match(/^[\w-]*$/i)) {
                    command = command + "os.environ[\""+name.toUpperCase()+"\"] = \""+message[name]+"\"\n";
                }
             }
        } else if (language_name.toLowerCase() === 'r') {
             for (var name in message) {
                if(name.toLowerCase().indexOf('project_')>-1 && message.hasOwnProperty(name) && message[name].match(/^[\w-]*$/i)) {
                    command = command + "Sys.setenv("+name.toUpperCase()+" = \""+message[name]+"\")\n";
                }
             }
        }
        kernel.execute(command);
    } catch (e) {
        console.error("Unable to set project parameters: " + e.message);
    }
}

KernelConnectionMonitor.prototype.stop_and_start_kernel = function (title, message) {
    var success = function (data, status, xhr) {
        if (data.hasOwnProperty("execution_state") && data["execution_state"] === "starting") {
            sendNewRelicMessage({type: title}, {});
            Jupyter.notebook.session.restart();
            var dialog = requirejs("base/js/dialog");
            dialog.kernel_modal({
                  title: title,
                  body: message,
                  keyboard_manager: Jupyter.keyboard_manager,
                  buttons: {
                    "Ok": { class: 'btn-primary' }
                  }
            });
        }
    }

    var error = function (xhr, status, err) {
        console.log("Error requesting kernel info: " + status);
    }
    Jupyter.notebook.kernel.get_info(success, error);

}

function addArgumentsToNbconvert () {
    var projectid = getUrlParameter("projectid");
    var project = getUrlParameter("project");
    var api_version = getUrlParameter("api", "v1");
    var instanceid = getUrlParameter("service");
    var env = getUrlParameter("env");
    var utils = requirejs('base/js/utils');
    Jupyter.menubar._nbconvert = function (format, download) {
        download = download || false;
        var notebook_path = utils.encode_uri_components(this.notebook.notebook_path);
        var url = utils.url_path_join(
            this.base_url,
            'nbconvert',
            format,
            notebook_path
        ) + "?download=" + download.toString()+"&project=" + project + "&api=" +api_version;
        if (projectid != false){
            url = url + "&projectid=" + projectid;
        }
        if (env != false){
            url = url + "&env=" + env;
        }
        if (env != false){
            url = url + "&env=" + env;
        }
        if (instanceid != false){
            url = url + "&service=" + instanceid;
        }
        var w = window.open('', Jupyter._target);
        if (this.notebook.dirty && this.notebook.writable) {
            this.notebook.save_notebook().then(function() {
                w.location = url;
            });
        } else {
            w.location = url;
        }
    };
}
