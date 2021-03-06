import { EventEmitter, Injectable, Optional } from '@angular/core';
import { Title } from '@angular/platform-browser';

import { AppPortal, IonicApp } from './app-root';
import { ClickBlock } from '../../util/click-block';
import { runInDev } from '../../util/util';
import { Config } from '../../config/config';
import { isNav, NavOptions, DIRECTION_FORWARD, DIRECTION_BACK } from '../../navigation/nav-util';
import { NavController } from '../../navigation/nav-controller';
import { Platform } from '../../platform/platform';
import { ViewController } from '../../navigation/view-controller';
import { MenuController } from '../menu/menu-controller';


/**
 * @name App
 * @description
 * App is a utility class used in Ionic to get information about various aspects of an app
 */
@Injectable()
export class App {

  private _disTime: number = 0;
  private _scrollTime: number = 0;
  private _title: string = '';
  private _titleSrv: Title = new Title();
  private _rootNav: NavController = null;
  private _disableScrollAssist: boolean;

  /**
   * @private
   */
  _clickBlock: ClickBlock;

  /**
   * @private
   */
  _appRoot: IonicApp;

  /**
   * @private
   */
  viewDidLoad: EventEmitter<any> = new EventEmitter();

  /**
   * @private
   */
  viewWillEnter: EventEmitter<any> = new EventEmitter();

  /**
   * @private
   */
  viewDidEnter: EventEmitter<any> = new EventEmitter();

  /**
   * @private
   */
  viewWillLeave: EventEmitter<any> = new EventEmitter();

  /**
   * @private
   */
  viewDidLeave: EventEmitter<any> = new EventEmitter();

  /**
   * @private
   */
  viewWillUnload: EventEmitter<any> = new EventEmitter();

  constructor(
    private _config: Config,
    private _platform: Platform,
    @Optional() private _menuCtrl?: MenuController
  ) {
    // listen for hardware back button events
    // register this back button action with a default priority
    _platform.registerBackButtonAction(this.goBack.bind(this));
    this._disableScrollAssist = _config.getBoolean('disableScrollAssist', false);

    runInDev(() => {
      // During developement, navPop can be triggered by calling
      // window.HWBackButton();
      if (!(<any>window)['HWBackButton']) {
        (<any>window)['HWBackButton'] = () => {
          let p = this.goBack();
          p && p.catch(() => console.debug('hardware go back cancelled'));
          return p;
        };
      }
    });
  }

  /**
   * Sets the document title.
   * @param {string} val  Value to set the document title to.
   */
  setTitle(val: string) {
    if (val !== this._title) {
      this._title = val;
      this._titleSrv.setTitle(val);
    }
  }

  /**
   * @private
   */
  setElementClass(className: string, isAdd: boolean) {
    this._appRoot.setElementClass(className, isAdd);
  }

  /**
   * @private
   * Sets if the app is currently enabled or not, meaning if it's
   * available to accept new user commands. For example, this is set to `false`
   * while views transition, a modal slides up, an action-sheet
   * slides up, etc. After the transition completes it is set back to `true`.
   * @param {boolean} isEnabled `true` for enabled, `false` for disabled
   * @param {number} duration  When `isEnabled` is set to `false`, this argument
   * is used to set the maximum number of milliseconds that app will wait until
   * it will automatically enable the app again. It's basically a fallback incase
   * something goes wrong during a transition and the app wasn't re-enabled correctly.
   */
  setEnabled(isEnabled: boolean, duration: number = 700) {
    this._disTime = (isEnabled ? 0 : Date.now() + duration);

    if (this._clickBlock) {
      if (isEnabled) {
        // disable the click block if it's enabled, or the duration is tiny
        this._clickBlock.activate(false,  CLICK_BLOCK_BUFFER_IN_MILLIS);

      } else {
        // show the click block for duration + some number
        this._clickBlock.activate(true, duration + CLICK_BLOCK_BUFFER_IN_MILLIS);
      }
    }
  }

  /**
   * @private
   * Toggles whether an application can be scrolled
   * @param {boolean} disableScroll when set to `false`, the application's
   * scrolling is enabled. When set to `true`, scrolling is disabled.
   */
  _setDisableScroll(disableScroll: boolean) {
    if (this._disableScrollAssist) {
      this._appRoot._disableScroll(disableScroll);
    }
  }

  /**
   * @private
   * Boolean if the app is actively enabled or not.
   * @return {boolean}
   */
  isEnabled(): boolean {
    const disTime = this._disTime;
    if (disTime === 0) {
      return true;
    }
    return (disTime < Date.now());
  }

  /**
   * @private
   */
  setScrolling() {
    this._scrollTime = Date.now() + ACTIVE_SCROLLING_TIME;
  }

  /**
   * Boolean if the app is actively scrolling or not.
   * @return {boolean} returns true or false
   */
  isScrolling(): boolean {
    const scrollTime = this._scrollTime;
    if (scrollTime === 0) {
      return false;
    }
    if (scrollTime < Date.now()) {
      this._scrollTime = 0;
      return false;
    }
    return true;
  }

  /**
   * @private
   */
  getActiveNav(): NavController {
    const portal = this._appRoot._getPortal(MODAL);
    if (portal.length() > 0) {
      return findTopNav(portal);
    }
    return findTopNav(this._rootNav || null);
  }

  /**
   * @return {NavController} Returns the root NavController
   */
  getRootNav(): NavController {
    return this._rootNav;
  }

  /**
   * @private
   */
  _setRootNav(nav: any) {
    this._rootNav = nav;
  }

  /**
   * @private
   */
  present(enteringView: ViewController, opts: NavOptions, appPortal?: AppPortal): Promise<any> {
    const portal = this._appRoot._getPortal(appPortal);

    enteringView._setNav(portal);

    opts.keyboardClose = false;
    opts.direction = DIRECTION_FORWARD;

    if (!opts.animation) {
      opts.animation = enteringView.getTransitionName(DIRECTION_FORWARD);
    }

    enteringView.setLeavingOpts({
      keyboardClose: false,
      direction: DIRECTION_BACK,
      animation: enteringView.getTransitionName(DIRECTION_BACK),
      ev: opts.ev
    });

    return portal.insertPages(-1, [enteringView], opts);
  }

  /**
   * @private
   */
  goBack(): Promise<any> {
    if (this._menuCtrl && this._menuCtrl.isOpen()) {
      return this._menuCtrl.close();
    }

    const navPromise = this.navPop();
    if (navPromise === null) {
      // no views to go back to
      // let's exit the app
      if (this._config.getBoolean('navExitApp', true)) {
        console.debug('app, goBack exitApp');
        this._platform.exitApp();
      }
    }
    return navPromise;
  }

  /**
   * @private
   */
  navPop(): Promise<any> {
    if (!this._rootNav || !this.isEnabled()) {
      return Promise.resolve();
    }

    // If there are any alert/actionsheet open, let's do nothing
    const portal = this._appRoot._getPortal(DEFAULT);
    if (portal.length() > 0) {
      return Promise.resolve();
    }
    // next get the active nav, check itself and climb up all
    // of its parent navs until it finds a nav that can pop
    return recursivePop(this.getActiveNav());
  }

}

function recursivePop(nav: any): Promise<any> {
  if (!nav) {
    return null;
  }
  if (isNav(nav)) {
    var len = nav.length();
    if (len > 1 || (nav._isPortal && len > 0)) {
      // this nav controller has more than one view
      // pop the current view on this nav and we're done here
      console.debug('app, goBack pop nav');
      return nav.pop();
    }
  }
  // try again using the parent nav (if there is one)
  return recursivePop(nav.parent);
}

function findTopNav(nav: NavController) {
  var activeChildNav: any;

  while (nav) {
    activeChildNav = nav.getActiveChildNav();
    if (!activeChildNav) {
      break;
    }
    nav = activeChildNav;
  }

  return nav;
}

const DEFAULT = 0; // AppPortal.DEFAULT
const MODAL = 1; // AppPortal.MODAL
const ACTIVE_SCROLLING_TIME = 100;
const CLICK_BLOCK_BUFFER_IN_MILLIS = 64;
