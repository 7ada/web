var appBounty;
let bounty = [];
let url = location.href;
let param = getURLParams();
const loadingState = {
  loading: 'loading',
  error: 'error',
  empty: 'empty',
  resolved: 'resolved'
};

document.result = bounty;
listen_for_web3_changes();

Vue.mixin({
  methods: {
    fetchBounty: function(newData) {
      let vm = this;
      let apiUrlBounty = `/actions/api/v0.1/bounty?github_url=${document.issueURL}`;
      const getBounty = fetchData(apiUrlBounty, 'GET');

      $.when(getBounty).then(function(response) {
        if (!response.length) {
          return vm.syncBounty();
        }

        if (param.url) {
          vm.syncBounty();
        }

        vm.bounty = response[0];
        vm.loadingState = 'resolved';
        vm.isOwner = vm.checkOwner(response[0].bounty_owner_github_username);
        vm.isOwnerAddress = vm.checkOwnerAddress(response[0].bounty_owner_address);
        document.result = response[0];
        if (newData) {
          delete sessionStorage['fulfillers'];
          delete sessionStorage['bountyId'];
          delete localStorage[document.issueURL];
          document.title = `${response[0].title} | Gitcoin`;
          window.history.replaceState({}, `${response[0].title} | Gitcoin`, response[0].url);
        }

        if (vm.bounty.event && localStorage['pendingProject'] && (vm.bounty.standard_bounties_id == localStorage['pendingProject'])) {
          projectModal(vm.bounty.pk);
        }
        vm.staffOptions();
      }).catch(function(error) {
        vm.loadingState = 'error';
        _alert('Error fetching bounties. Please contact founders@gitcoin.co', 'error');
      });
    },
    syncBounty: function() {
      let vm = this;

      if (!localStorage[document.issueURL]) {
        vm.loadingState = 'notfound';
        return;
      }

      vm.loadingState = 'empty';

      let bountyMetadata = JSON.parse(localStorage[document.issueURL]);

      async function waitBlock(txid) {
        let receipt = promisify(cb => web3.eth.getTransactionReceipt(txid, cb));

        try {
          let result = await receipt;
          let syncPool;

          console.log(result);
          const data = {
            url: document.issueURL,
            txid: txid,
            network: document.web3network
          };
          let syncDb = fetchData ('/sync/web3/', 'POST', data);

          $.when(syncDb).then(function(response) {
            console.log(response);
            vm.fetchBounty(true);
            return clearTimeout(syncPool);
          }).catch(function(error) {
            syncPool = setTimeout(() => vm.syncBounty(), 10000);
          });
        } catch (error) {
          return error;
        }
      }
      waitBlock(bountyMetadata.txid);
      waitingRoomEntertainment();

    },
    checkOwner: function(handle) {
      let vm = this;

      if (vm.contxt.github_handle) {
        return caseInsensitiveCompare(document.contxt['github_handle'], handle);
      }
      return false;

    },
    checkOwnerAddress: function(bountyOwnerAddress) {
      let vm = this;

      if (cb_address) {
        return caseInsensitiveCompare(cb_address, bountyOwnerAddress);
      }
      return false;

    },
    checkInterest: function() {
      let vm = this;

      if (!vm.contxt.github_handle) {
        return false;
      }
      let isInterested = !!(vm.bounty.interested || []).find(interest => caseInsensitiveCompare(interest.profile.handle, vm.contxt.github_handle));
      // console.log(isInterested)

      return isInterested;

    },
    checkApproved: function() {
      let vm = this;

      if (!vm.contxt.github_handle) {
        return false;
      }
      // pending=false
      let result = vm.bounty.interested.find(interest => caseInsensitiveCompare(interest.profile.handle, vm.contxt.github_handle));

      return result ? !result.pending : false;

    },
    checkFulfilled: function() {
      let vm = this;

      if (!vm.contxt.github_handle) {
        return false;
      }
      return !!(vm.bounty.fulfillments || []).find(fulfiller => caseInsensitiveCompare(fulfiller.fulfiller_github_username, vm.contxt.github_handle));
    },
    syncGhIssue: function() {
      let vm = this;
      let apiUrlIssueSync = `/sync/get_issue_details?url=${encodeURIComponent(vm.bounty.github_url)}&token=${currentProfile.githubToken}`;
      const getIssueSync = fetchData(apiUrlIssueSync, 'GET');

      $.when(getIssueSync).then(function(response) {
        vm.updateGhIssue(response);
      });
    },
    updateGhIssue: function(response) {
      let vm = this;
      const payload = JSON.stringify({
        issue_description: response.description,
        title: response.title
      });
      let apiUrlUpdateIssue = `/bounty/change/${vm.bounty.pk}`;
      const postUpdateIssue = fetchData(apiUrlUpdateIssue, 'POST', payload);

      $.when(postUpdateIssue).then(function(response) {
        vm.bounty.issue_description = response.description;
        vm.bounty.title = response.title;
        _alert({ message: response.msg }, 'success');
      }).catch(function(response) {
        _alert({ message: response.responseJSON.error }, 'error');
      });
    },
    copyTextToClipboard: function(text) {
      if (!navigator.clipboard) {
        _alert('Could not copy text to clipboard', 'error', 5000);
      } else {
        navigator.clipboard.writeText(text).then(function() {
          _alert('Text copied to clipboard', 'success', 5000);
        }, function(err) {
          _alert('Could not copy text to clipboard', 'error', 5000);
        });
      }
    },
    fulfillmentComplete: function(fulfillment_id, amount) {

      let vm = this;

      const token_name = vm.bounty.token_name;
      const decimals = tokenNameToDetails('mainnet', token_name).decimals;

      const payload = {
        amount: amount * 10 ** decimals,
        token_name: token_name,
        bounty_owner_address: vm.bounty.bounty_owner_address
      };

      const apiUrlBounty = `/api/v1/bounty/payout/${fulfillment_id}`;

      fetchData(apiUrlBounty, 'POST', payload).then(response => {
        if (200 <= response.status && response.status <= 204) {
          console.log('success', response);
        } else {
          _alert('Unable to make payout bounty. Please try again later', 'error');
          console.error(`error: bounty payment failed with status: ${response.status} and message: ${response.message}`);
        }
      });
    },
    closeBounty: function() {

      let vm = this;
      const bounty_id = vm.bounty.pk;

      const apiUrlBounty = `/api/v1/bounty/${bounty_id}/close`;

      fetchData(apiUrlBounty, 'POST').then(response => {
        if (200 <= response.status && response.status <= 204) {
          vm.bounty.status = 'done';
        } else {
          _alert('Unable to close. bounty. Please try again later', 'error');
          console.error(`error: bounty closure failed with status: ${response.status} and message: ${response.message}`);
        }
      });
    },
    show_extend_deadline_modal: function() {
      show_extend_deadline_modal();
    },
    show_interest_modal: function() {
      show_interest_modal();
    },
    staffOptions: function() {
      let vm = this;

      if (!vm.bounty.pk) {
        return;
      }

      if (vm.contxt.is_staff) {
        vm.quickLinks.push({
          label: 'View in Admin',
          href: `/_administrationdashboard/bounty/${vm.bounty.pk}/change/`,
          title: 'View in Admin Tool'
        }, {
          label: 'Hide Bounty',
          href: `${vm.bounty.url}?admin_override_and_hide=1`,
          title: 'Hides Bounty from Active Bounties'
        }, {
          label: 'Toggle Remarket Ready',
          href: `${vm.bounty.url}?admin_toggle_as_remarket_ready=1`,
          title: 'Sets Remarket Ready if not already remarket ready.  Unsets it if already remarket ready.'
        }, {
          label: 'Suspend Auto Approval',
          href: `${vm.bounty.url}?suspend_auto_approval=1`,
          title: 'Suspend *Auto Approval* of Bounty Hunters Who Have Applied for This Bounty'
        });

        if (vm.bounty.needs_review) {
          vm.quickLinks.push({
            label: 'Mark as Reviewed',
            href: `${vm.bounty.url}?mark_reviewed=1`,
            title: 'Suspend *Auto Approval* of Bounty Hunters Who Have Applied for This Bounty'
          });
        }
      }
    },
    hasAcceptedFulfillments: function() {
      let vm = this;

      if (!vm.bounty) {
        return [];
      }

      if (vm.is_bounties_network) {
        return vm.bounty.fulfillments.filter(fulfillment => fulfillment.accepted);
      }

      return vm.bounty.fulfillments.filter(fulfillment =>
        fulfillment.accepted &&
          fulfillment.payout_status == 'done'
      );

    },
    stopWork: function(isOwner) {
      let text = isOwner ?
        'Are you sure you would like to stop this user from working on this bounty ?' :
        'Are you sure you would like to stop working on this bounty ?';

      if (!confirm(text)) {
        return;
      }

      let vm = this;

      const headers = {
        'X-CSRFToken': csrftoken
      };

      const apiUrlBounty = `/actions/bounty/${vm.bounty.pk}/interest/remove/`;

      fetchData(apiUrlBounty, 'POST', {}, headers).then(response => {
        if (200 <= response.status && response.status <= 204) {
          this.fetchBounty();
          let text = isOwner ?
            "'You\'ve stopped the user from working on this bounty ?" :
            "'You\'ve stopped work on this bounty";

          _alert(text, 'success');
        } else {
          _alert('Unable to stop work on bounty. Please try again later', 'error');
          console.error(`error: stopping work on bounty failed due to : ${response}`);
        }
      });
    }
  },
  computed: {
    sortedActivity: function() {
      const token_details = tokenAddressToDetailsByNetwork(
        this.bounty.token_address, this.bounty.network
      );
      const decimals = token_details && token_details.decimals;

      let activities = this.bounty.activities.sort((a, b) => new Date(b.created) - new Date(a.created));

      if (decimals) {
        activities.forEach(activity => {
          if (activity.metadata) {
            if (activity.metadata.new_bounty) {
              activity.metadata.new_bounty['token_value'] = activity.metadata.new_bounty.value_in_token / 10 ** decimals;
              if (activity.metadata.old_bounty) {
                activity.metadata.old_bounty['token_value'] = activity.metadata.old_bounty.value_in_token / 10 ** decimals;
              }
            } else {
              activity.metadata['token_value'] = activity.metadata.value_in_token / 10 ** decimals;
            }
          }
        });
      }
      return activities;
    }
  }
});


if (document.getElementById('gc-bounty-detail')) {
  appBounty = new Vue({
    delimiters: [ '[[', ']]' ],
    el: '#gc-bounty-detail',
    data() {
      return {
        loadingState: loadingState['loading'],
        bounty: bounty,
        url: url,
        cb_address: cb_address,
        isOwner: false,
        isOwnerAddress: false,
        is_bounties_network: is_bounties_network,
        inputAmount: 0,
        inputBountyOwnerAddress: bounty.bounty_owner_address,
        contxt: document.contxt,
        quickLinks: []
      };
    },
    mounted() {
      this.fetchBounty();
    }
  });
}


var show_extend_deadline_modal = function() {
  let modals = $('#modalExtend');
  let modalBody = $('#modalExtend .modal-content');
  const url = '/modal/extend_issue_deadline?pk=' + document.result['pk'];

  moment.locale('en');
  modals.on('show.bs.modal', function() {
    modalBody.load(url, ()=> {
      const currentExpires = moment.utc(document.result['expires_date']);

      $('#modalExtend input[name="expirationTimeDelta"]').daterangepicker({
        parentEl: '#extend_deadline',
        singleDatePicker: true,
        startDate: moment(currentExpires).add(1, 'month'),
        minDate: moment().add(1, 'day'),
        ranges: {
          '1 week': [ moment(currentExpires).add(7, 'days'), moment(currentExpires).add(7, 'days') ],
          '2 weeks': [ moment(currentExpires).add(14, 'days'), moment(currentExpires).add(14, 'days') ],
          '1 month': [ moment(currentExpires).add(1, 'month'), moment(currentExpires).add(1, 'month') ],
          '3 months': [ moment(currentExpires).add(3, 'month'), moment(currentExpires).add(3, 'month') ],
          '1 year': [ moment(currentExpires).add(1, 'year'), moment(currentExpires).add(1, 'year') ]
        },
        'locale': {
          'customRangeLabel': 'Custom'
        }
      }, function(start, end, label) {
        set_extended_time_html(end);
      });

      set_extended_time_html($('#modalExtend input[name="expirationTimeDelta"]').data('daterangepicker').endDate);

      $('#neverExpires').on('click', () => {
        if ($('#neverExpires').is(':checked')) {
          $('#expirationTimeDelta').attr('disabled', true);
          $('#extended-expiration-date #extended-days').html('Never');
          $('#extended-expiration-date #extended-date').html('-');
        } else {
          $('#expirationTimeDelta').attr('disabled', false);
          set_extended_time_html($('#modalExtend input[name="expirationTimeDelta"]').data('daterangepicker').endDate);
        }
      });

      modals.on('submit', function(event) {
        event.preventDefault();

        var extended_time = $('input[name=updatedExpires]').val();

        extend_expiration(document.result['pk'], {
          deadline: extended_time
        });
        // setTimeout(function() {
        //   window.location.reload();
        // }, 2000);
      });
    });
  });
  modals.bootstrapModal('show');
  $(document, modals).on('hidden.bs.modal', function(e) {
    $('#extend_deadline').remove();
    $('.daterangepicker').remove();
  });
};

var set_extended_time_html = function(extendedDuration) {
  extendedDuration = extendedDuration.set({hour: 0, minute: 0, second: 0, millisecond: 0});
  $('input[name=updatedExpires]').val(extendedDuration.utc().unix());
  $('#extended-expiration-date #extended-date').html(extendedDuration.format('MM-DD-YYYY hh:mm A'));
  $('#extended-expiration-date #extended-days').html(moment.utc(extendedDuration).fromNow());
};

var extend_expiration = function(bounty_pk, data) {
  var request_url = '/actions/bounty/' + bounty_pk + '/extend_expiration/';

  $.post(request_url, data, function(result) {

    if (result.success) {
      _alert({ message: result.msg }, 'success');
      appBounty.bounty.expires_date = moment.unix(data.deadline).utc().format();
      return appBounty.bounty.expires_date;
    }
    return false;
  }).fail(function(result) {
    _alert({ message: gettext('got an error. please try again, or contact support@gitcoin.co') }, 'error');
  });
};

var show_interest_modal = function() {
  var self = this;
  var modals = $('#modalInterest');
  let modalBody = $('#modalInterest .modal-content');
  let modalUrl = `/interest/modal?redirect=${window.location.pathname}&pk=${document.result['pk']}`;

  modals.on('show.bs.modal', function() {
    modalBody.load(modalUrl, ()=> {
      if (document.result['repo_type'] === 'private') {
        document.result.unsigned_nda ? $('.nda-download-link').attr('href', document.result.unsigned_nda.doc) : $('#nda-upload').hide();
      }

      let actionPlanForm = $('#action_plan');
      let issueMessage = $('#issue_message');

      issueMessage.attr('placeholder', gettext('What steps will you take to complete this task? (min 30 chars)'));

      actionPlanForm.on('submit', function(event) {
        event.preventDefault();

        let msg = issueMessage.val().trim();

        if (!msg || msg.length < 30) {
          _alert({message: gettext('Please provide an action plan for this ticket. (min 30 chars)')}, 'error');
          return false;
        }

        const issueNDA = document.result['repo_type'] === 'private' ? $('#issueNDA')[0].files : undefined;

        if (issueNDA && typeof issueNDA[0] !== 'undefined') {

          const formData = new FormData();

          formData.append('docs', issueNDA[0]);
          formData.append('doc_type', 'signed_nda');

          const ndaSend = {
            url: '/api/v0.1/bountydocument',
            method: 'POST',
            data: formData,
            processData: false,
            dataType: 'json',
            contentType: false
          };

          $.ajax(ndaSend).done(function(response) {
            if (response.status == 200) {
              _alert(response.message, 'info');
              add_interest(document.result['pk'], {
                issue_message: msg,
                signed_nda: response.bounty_doc_id,
                discord_username: $('#discord_username').length ? $('#discord_username').val() : null
              }).then(success => {
                if (success) {
                  $(self).attr('href', '/uninterested');
                  $(self).find('span').text(gettext('Stop Work'));
                  $(self).parent().attr('title', '<div class="tooltip-info tooltip-sm">' + gettext('Notify the funder that you will not be working on this project') + '</div>');
                  modals.bootstrapModal('hide');
                }
              }).catch((error) => {
                if (error.responseJSON.error === 'You may only work on max of 3 issues at once.')
                  return;
                throw error;
              });
            } else {
              _alert(response.message, 'error');
            }
          }).fail(function(error) {
            _alert(error, 'error');
          });
        } else {
          add_interest(document.result['pk'], {
            issue_message: msg,
            discord_username: $('#discord_username').length ? $('#discord_username').val() : null
          }).then(success => {
            if (success) {
              // $(self).attr('href', '/uninterested');
              // $(self).find('span').text(gettext('Stop Work'));
              // $(self).parent().attr('title', '<div class="tooltip-info tooltip-sm">' + gettext('Notify the funder that you will not be working on this project') + '</div>');
              appBounty.fetchBounty();
              modals.bootstrapModal('hide');

              if (document.result.event) {
                projectModal(document.result.pk);
              }
            }
          }).catch((error) => {
            if (error.responseJSON.error === 'You may only work on max of 3 issues at once.')
              return;
            throw error;
          });
        }

      });

    });
  });
  modals.bootstrapModal('show');
};

$('body').on('click', '.issue_description img', function() {
  var content = $.parseHTML(
    '<div><div class="row"><div class="col-12 closebtn">' +
      '<a id="" rel="modal:close" href="javascript:void" class="close" aria-label="Close dialog">' +
        '<span aria-hidden="true">&times;</span>' +
      '</a>' +
    '</div>' +
    '<div class="col-12 pt-2 pb-2"><img class="magnify" src="' + $(this).attr('src') + '"/></div></div></div>');

  $(content).appendTo('body').modal({
    modalClass: 'modal magnify'
  });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const promisify = (inner) =>
  new Promise((resolve, reject) =>
    inner((err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    })
  );

/**
 * Checks sessionStorage to toggle to show the quote
 * container vs showing the list of fulfilled users to be
 * invite.
 */
const show_invite_users = () => {

  if (sessionStorage['fulfillers']) {
    const users = sessionStorage['fulfillers'].split(',');
    const bountyId = sessionStorage['bountyId'];

    if (users.length == 1) {

      let user = users[0];
      const title = `Work with <b>${user}</b> again on your next bounty ?`;
      const invite = `
        <div class="invite-user">
          <img class="avatar" src="/dynamic/avatar/${users}" />
          <p class="mt-4">
            <a target="_blank" class="btn btn-gc-blue shadow-none py-2 px-4" href="/users?invite=${user}&current-bounty=${bountyId}">
              Yes, invite to one of my bounties
            </a>
          </p>
        </div>`;

      $('#invite-header').html(title);
      $('#invite-users').html(invite);
    } else {

      let invites = [];
      const title = 'Work with these contributors again on your next bounty?';

      users.forEach(user => {
        const invite = `
          <div class="invite-user mx-3">
            <img class="avatar" src="/dynamic/avatar/${user}"/>
            <p class="my-2">
              <a target="_blank" class="font-subheader blue" href="/profile/${user}">
                ${user}
              </a>
            </p>
            <a target="_blank" class="btn btn-gc-blue shadow-none px-4 font-body font-weight-semibold" href="/users?invite=${user}&current-bounty=${bountyId}"">
              Invite
            </a>
          </div>`;

        invites.push(invite);
      });

      $('#invite-users').addClass('d-flex justify-content-center');
      $('#invite-header').html(title);
      $('#invite-users').html(invites);
    }
    $('.invite-user-container').removeClass('hidden');
    $('.quote-container').addClass('hidden');
  } else {
    $('.invite-user-container').addClass('hidden');
    $('.quote-container').removeClass('hidden');
  }
};

// async function waitBlock(txid) {
//   while (true) {
//     let receipt = web3.eth.getTransactionReceipt(txid);
//     if (receipt && receipt.contractAddress) {
//       console.log("Your contract has been deployed at http://testnet.etherscan.io/address/" + receipt.contractAddress);
//       console.log("Note that it might take 30 - 90 sceonds for the block to propagate befor it's visible in etherscan.io");
//       break;
//     }
//     console.log("Waiting a mined block to include your contract... currently in block " + web3.eth.blockNumber);
//     await sleep(4000);
//   }
// }
