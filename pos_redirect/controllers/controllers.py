# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import datetime
import json
import os
import logging
import pytz
import requests
import werkzeug.utils
import werkzeug.wrappers

from itertools import islice
from xml.etree import ElementTree as ET

import odoo

from odoo import http, models, fields, _
from odoo.http import request
from odoo.tools import OrderedSet
from odoo.addons.http_routing.models.ir_http import slug, _guess_mimetype
from odoo.addons.web.controllers.main import Binary
from odoo.addons.portal.controllers.portal import pager as portal_pager
from odoo.addons.web.controllers.main import Home

logger = logging.getLogger(__name__)

class PosRedirect(Home):

    # ------------------------------------------------------
    # Login - overwrite of the web login so that regular users are redirected to the backend
    # while portal users are redirected to the frontend by default
    # ------------------------------------------------------

    @http.route(website=True, auth="public", sitemap=False)
    def web_login(self, redirect=None, *args, **kw):
        logger.info("********************************* POS Redirect ****************************************")
        response = super(PosRedirect, self).web_login(redirect=redirect, *args, **kw)
        if not redirect and request.params['login_success']:
            if request.env['res.users'].browse(request.uid).automatic_pos and request.env['res.users'].browse(request.uid).pos_config_id:
                if not request.env['pos.session'].search([('state','=','open')],limit=1):
                    request.env['res.users'].browse(request.uid).pos_config_id.open_session_cb()
                    redirect = '/pos/web?config_id='+str(request.env['res.users'].browse(request.uid).pos_config_id.id)+'#action=pos.ui&cids=1'
                else:
                    redirect = '/pos/web?config_id=' + str(request.env['res.users'].browse(request.uid).pos_config_id.id) + '#action=pos.ui&cids=1'
            else:
                redirect = b'/web?' + request.httprequest.query_string
            return http.redirect_with_hash(redirect)
        return response

